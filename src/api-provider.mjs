import { normalizeApiProvider, resolveApiRoute } from "../public/lib/api-routes.js";

const PROVIDER_ENDPOINTS = Object.freeze({
  openai: {
    models: "https://api.openai.com/v1/models",
    generate: "https://api.openai.com/v1/responses",
    transport: "responses"
  },
  xai: {
    models: "https://api.x.ai/v1/models",
    generate: "https://api.x.ai/v1/chat/completions",
    transport: "chat-completions"
  }
});

export class ApiProviderError extends Error {
  constructor(message, { code = "API_PROVIDER_ERROR", status = 0 } = {}) {
    super(message);
    this.name = "ApiProviderError";
    this.code = code;
    this.status = status;
  }
}

function apiKey(value) {
  const key = String(value || "").trim();
  if (!key) throw new ApiProviderError("请先填写 API Key。", { code: "API_KEY_MISSING", status: 401 });
  if (key.length > 512) throw new ApiProviderError("API Key 格式异常。", { code: "API_KEY_INVALID", status: 400 });
  return key;
}

function stripCodeFence(value) {
  return String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseApiJson(value) {
  const text = stripCodeFence(value);
  if (!text) throw new ApiProviderError("模型没有返回结构化内容。", { code: "EMPTY_OUTPUT", status: 502 });
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiProviderError("模型返回的内容不是有效 JSON。", { code: "PARSE_ERROR", status: 502 });
  }
}

function openAiOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const chunks = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function chatCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
  }
  return "";
}

async function providerResponse(response, providerLabel) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiProviderError(`${providerLabel} 返回了无法识别的响应。`, {
      code: "INVALID_PROVIDER_RESPONSE",
      status: response.status
    });
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `${providerLabel} 请求失败（HTTP ${response.status}）`;
    throw new ApiProviderError(message, { code: "PROVIDER_REJECTED", status: response.status });
  }
  return payload;
}

function requestHeaders(key) {
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/json"
  };
}
export async function testApiProvider({ provider: providerValue, apiKey: apiKeyValue, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== "function") throw new ApiProviderError("当前运行环境不支持网络请求。", { code: "FETCH_UNAVAILABLE" });
  const provider = normalizeApiProvider(providerValue);
  const endpoint = PROVIDER_ENDPOINTS[provider];
  const key = apiKey(apiKeyValue);
  let response;
  try {
    response = await fetchImpl(endpoint.models, {
      method: "GET",
      headers: { authorization: `Bearer ${key}` },
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiProviderError("连接测试已取消。", { code: "CANCELLED", status: 499 });
    throw new ApiProviderError("无法连接模型服务，请检查网络后重试。", { code: "PROVIDER_NETWORK_ERROR", status: 502 });
  }
  const payload = await providerResponse(response, provider === "openai" ? "OpenAI API" : "xAI API");
  return {
    provider,
    modelCount: Array.isArray(payload?.data) ? payload.data.length : null
  };
}

export async function runApiProviderJson({ provider: providerValue, apiKey: apiKeyValue, routeKey, prompt, fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== "function") throw new ApiProviderError("当前运行环境不支持网络请求。", { code: "FETCH_UNAVAILABLE" });
  const provider = normalizeApiProvider(providerValue);
  const endpoint = PROVIDER_ENDPOINTS[provider];
  const route = resolveApiRoute(provider, routeKey);
  const key = apiKey(apiKeyValue);
  const input = String(prompt || "").trim();
  if (!input) throw new ApiProviderError("缺少 AI 任务内容。", { code: "PROMPT_MISSING", status: 400 });

  const body = endpoint.transport === "responses"
    ? {
        model: route.model,
        input,
        reasoning: { effort: route.effort },
        text: { format: { type: "json_object" } },
        max_output_tokens: 16000,
        store: false
      }
    : {
        model: route.model,
        messages: [{ role: "user", content: input }],
        response_format: { type: "json_object" },
        temperature: 0
      };

  let response;
  try {
    response = await fetchImpl(endpoint.generate, {
      method: "POST",
      headers: requestHeaders(key),
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiProviderError("已取消本次 API 生成。", { code: "CANCELLED", status: 499 });
    throw new ApiProviderError("无法连接模型服务，请检查网络后重试。", { code: "PROVIDER_NETWORK_ERROR", status: 502 });
  }

  const payload = await providerResponse(response, route.providerLabel);
  const text = endpoint.transport === "responses" ? openAiOutputText(payload) : chatCompletionText(payload);
  return {
    result: parseApiJson(text),
    route,
    requestId: response.headers?.get?.("x-request-id") || ""
  };
}
