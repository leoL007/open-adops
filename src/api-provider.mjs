import {
  apiProtocolLabel,
  normalizeApiPreferences,
  resolveApiRoute,
  usesOfficialOpenAiRouting
} from "../public/lib/api-routes.js";

const ANTHROPIC_VERSION = "2023-06-01";
const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home"];

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
  if (key.length > 512 || /[\r\n]/.test(key)) {
    throw new ApiProviderError("API Key 格式异常。", { code: "API_KEY_INVALID", status: 400 });
  }
  return key;
}

function privateOrLocalHostname(hostname) {
  const value = String(hostname || "").toLowerCase();
  if (!value || value === "localhost" || value.includes(":")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  if (!value.includes(".")) return true;
  return PRIVATE_HOST_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

export function normalizeApiBaseUrl(value, { protocol = "openai", allowPrivateHosts = false } = {}) {
  const preferences = normalizeApiPreferences({ protocol, baseUrl: value });
  const input = String(preferences.baseUrl || "").trim();
  if (!input || input.length > 500) {
    throw new ApiProviderError("请填写有效的 Base URL。", { code: "BASE_URL_INVALID", status: 400 });
  }
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new ApiProviderError("Base URL 无法解析。", { code: "BASE_URL_INVALID", status: 400 });
  }
  if (!allowPrivateHosts && url.protocol !== "https:") {
    throw new ApiProviderError("网站版 Base URL 必须使用 HTTPS。", { code: "BASE_URL_UNSAFE", status: 400 });
  }
  if (allowPrivateHosts && !["http:", "https:"].includes(url.protocol)) {
    throw new ApiProviderError("Base URL 只支持 HTTP 或 HTTPS。", { code: "BASE_URL_INVALID", status: 400 });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiProviderError("Base URL 不能包含账号、查询参数或锚点。", { code: "BASE_URL_INVALID", status: 400 });
  }
  if (!allowPrivateHosts && privateOrLocalHostname(url.hostname)) {
    throw new ApiProviderError("网站版不能访问 localhost、IP 地址或内网服务；请改用本地版。", {
      code: "BASE_URL_PRIVATE",
      status: 400
    });
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function normalizeApiModel(value, { preferences } = {}) {
  const config = normalizeApiPreferences(preferences || {});
  const model = String(value ?? config.model).trim();
  if (usesOfficialOpenAiRouting({ ...config, model })) return "auto";
  if (model.toLowerCase() === "auto") {
    throw new ApiProviderError("只有 OpenAI 官方地址支持 auto；其他服务请填写模型 ID。", {
      code: "MODEL_REQUIRED",
      status: 400
    });
  }
  if (!model || model.length > 200 || /[\r\n]/.test(model)) {
    throw new ApiProviderError("请填写模型 ID。", { code: "MODEL_REQUIRED", status: 400 });
  }
  return model;
}

function endpoint(baseUrl, path) {
  return `${baseUrl}/${String(path).replace(/^\/+/, "")}`;
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

function anthropicMessageText(payload) {
  return (Array.isArray(payload?.content) ? payload.content : [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

async function providerResponse(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiProviderError(`${label}返回了无法识别的响应。`, {
      code: "INVALID_PROVIDER_RESPONSE",
      status: response.status
    });
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || `${label}请求失败（HTTP ${response.status}）`;
    throw new ApiProviderError(String(message), { code: "PROVIDER_REJECTED", status: response.status });
  }
  return payload;
}

function requestHeaders(protocol, key) {
  if (protocol === "anthropic") {
    return {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    };
  }
  return {
    authorization: `Bearer ${key}`,
    "content-type": "application/json"
  };
}

function requestConfig({ protocol, baseUrl, model, allowPrivateHosts }) {
  const preferences = normalizeApiPreferences({ protocol, baseUrl, model });
  const normalizedBaseUrl = normalizeApiBaseUrl(preferences.baseUrl, {
    protocol: preferences.protocol,
    allowPrivateHosts
  });
  const normalizedModel = normalizeApiModel(preferences.model, {
    preferences: { ...preferences, baseUrl: normalizedBaseUrl }
  });
  return {
    ...preferences,
    baseUrl: normalizedBaseUrl,
    model: normalizedModel
  };
}

export async function testApiProvider({
  protocol,
  provider,
  apiKey: apiKeyValue,
  baseUrl,
  model,
  allowPrivateHosts = false,
  fetchImpl = globalThis.fetch,
  signal
} = {}) {
  if (typeof fetchImpl !== "function") throw new ApiProviderError("当前运行环境不支持网络请求。", { code: "FETCH_UNAVAILABLE" });
  const config = requestConfig({ protocol: protocol || provider, baseUrl, model, allowPrivateHosts });
  const key = apiKey(apiKeyValue);
  let response;
  try {
    response = await fetchImpl(endpoint(config.baseUrl, "models"), {
      method: "GET",
      headers: requestHeaders(config.protocol, key),
      redirect: "error",
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiProviderError("连接测试已取消。", { code: "CANCELLED", status: 499 });
    throw new ApiProviderError("无法连接模型服务，请检查 Base URL 和网络后重试。", { code: "PROVIDER_NETWORK_ERROR", status: 502 });
  }
  const payload = await providerResponse(response, apiProtocolLabel(config.protocol));
  return {
    ...config,
    modelCount: Array.isArray(payload?.data) ? payload.data.length : null
  };
}

export async function runApiProviderJson({
  protocol,
  provider,
  apiKey: apiKeyValue,
  baseUrl,
  model,
  routeKey,
  prompt,
  allowPrivateHosts = false,
  fetchImpl = globalThis.fetch,
  signal
} = {}) {
  if (typeof fetchImpl !== "function") throw new ApiProviderError("当前运行环境不支持网络请求。", { code: "FETCH_UNAVAILABLE" });
  const config = requestConfig({ protocol: protocol || provider, baseUrl, model, allowPrivateHosts });
  const route = resolveApiRoute(config, routeKey);
  const key = apiKey(apiKeyValue);
  const input = String(prompt || "").trim();
  if (!input) throw new ApiProviderError("缺少 AI 任务内容。", { code: "PROMPT_MISSING", status: 400 });

  const officialOpenAi = usesOfficialOpenAiRouting(config);
  const transport = config.protocol === "anthropic"
    ? "anthropic-messages"
    : officialOpenAi ? "responses" : "chat-completions";
  const generateUrl = endpoint(config.baseUrl, transport === "responses"
    ? "responses"
    : transport === "anthropic-messages" ? "messages" : "chat/completions");
  const body = transport === "responses"
    ? {
        model: route.model,
        input,
        reasoning: { effort: route.effort },
        text: { format: { type: "json_object" } },
        max_output_tokens: 16000,
        store: false
      }
    : transport === "anthropic-messages"
      ? {
          model: route.model,
          max_tokens: 16000,
          messages: [{ role: "user", content: input }],
          temperature: 0
        }
      : {
          model: route.model,
          messages: [{ role: "user", content: input }],
          response_format: { type: "json_object" },
          temperature: 0
        };

  let response;
  try {
    response = await fetchImpl(generateUrl, {
      method: "POST",
      headers: requestHeaders(config.protocol, key),
      body: JSON.stringify(body),
      redirect: "error",
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiProviderError("已取消本次 API 生成。", { code: "CANCELLED", status: 499 });
    throw new ApiProviderError("无法连接模型服务，请检查 Base URL 和网络后重试。", { code: "PROVIDER_NETWORK_ERROR", status: 502 });
  }

  const payload = await providerResponse(response, apiProtocolLabel(config.protocol));
  const text = transport === "responses"
    ? openAiOutputText(payload)
    : transport === "anthropic-messages" ? anthropicMessageText(payload) : chatCompletionText(payload);
  return {
    result: parseApiJson(text),
    route,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: route.model,
    requestId: response.headers?.get?.("x-request-id") || response.headers?.get?.("request-id") || ""
  };
}
