import { APP_VERSION } from "../public/version.js";
import { normalizeApiPreferences, publicApiRoutes } from "../public/lib/api-routes.js";
import { ApiProviderError, runApiProviderJson, testApiProvider } from "./api-provider.mjs";
import { validateAnalysis } from "./analysis-validator.mjs";
import { validateCreativeRequirements } from "./creative-requirements-validator.mjs";
import { validateIntake } from "./intake-validator.mjs";
import { validateLaunchPack } from "./launch-pack-validator.mjs";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const VALIDATORS = {
  intakeQuestions: validateIntake,
  intakeStrategy: validateIntake,
  intakeDeep: validateIntake,
  analysis: validateAnalysis,
  optimizeAnalysis: validateAnalysis,
  creativeRequirements: validateCreativeRequirements,
  launchPack: validateLaunchPack
};
const ROUTE_SCHEMAS = {
  intakeQuestions: "intake.schema.json",
  intakeStrategy: "intake.schema.json",
  intakeDeep: "intake.schema.json",
  analysis: "analysis.schema.json",
  optimizeAnalysis: "analysis.schema.json",
  creativeRequirements: "creative-requirements.schema.json",
  launchPack: "launch-pack.schema.json"
};

function securityHeaders(headers = new Headers()) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return headers;
}

function jsonResponse(payload, status = 200) {
  const headers = securityHeaders(new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }));
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(error) {
  const status = Number(error?.status) || (error?.code === "CANCELLED" ? 499 : 502);
  return jsonResponse({
    ok: false,
    code: error?.code || "API_PROVIDER_ERROR",
    error: error?.message || "API 模型调用失败。"
  }, status);
}

async function jsonBody(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new ApiProviderError("请求体过大。", { code: "BODY_TOO_LARGE", status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiProviderError("请求体过大。", { code: "BODY_TOO_LARGE", status: 413 });
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiProviderError("请求 JSON 无法解析。", { code: "INVALID_JSON", status: 400 });
  }
}

function credentials(request) {
  return {
    ...normalizeApiPreferences({
      protocol: request.headers.get("x-openadops-protocol") || request.headers.get("x-openadops-provider"),
      baseUrl: request.headers.get("x-openadops-base-url"),
      model: request.headers.get("x-openadops-model")
    }),
    apiKey: request.headers.get("x-openadops-api-key") || ""
  };
}

async function handleProviderTest(request) {
  const result = await testApiProvider(credentials(request));
  return jsonResponse({
    ok: true,
    source: "api",
    protocol: result.protocol,
    provider: result.protocol,
    baseUrl: result.baseUrl,
    model: result.model,
    modelCount: result.modelCount,
    routes: publicApiRoutes(result)
  });
}

async function handleProviderGenerate(request, env) {
  const startedAt = Date.now();
  const apiConfig = credentials(request);
  const body = await jsonBody(request);
  const routeKey = String(body.routeKey || "");
  const validate = VALIDATORS[routeKey];
  if (!validate) throw new ApiProviderError("未知 API 任务。", { code: "UNKNOWN_ROUTE", status: 400 });
  const schemaResponse = await env.ASSETS.fetch(new Request(new URL(`/schemas/${ROUTE_SCHEMAS[routeKey]}`, request.url)));
  if (!schemaResponse.ok) throw new ApiProviderError("无法加载任务结构定义。", { code: "SCHEMA_UNAVAILABLE", status: 500 });
  const structuredPrompt = `${String(body.prompt || "").trim()}\n\n必须严格符合以下 JSON Schema：\n${await schemaResponse.text()}`;
  const { result, route, requestId } = await runApiProviderJson({
    ...apiConfig,
    routeKey,
    prompt: structuredPrompt
  });
  const validation = validate(result);
  if (!validation.valid) {
    throw new ApiProviderError(`结构校验失败：${validation.errors.join("；")}`, {
      code: "STRUCTURE_ERROR",
      status: 502
    });
  }
  return jsonResponse({
    ok: true,
    source: "api",
    provider: apiConfig.protocol,
    protocol: apiConfig.protocol,
    routeKey,
    model: route.model,
    reasoningEffort: route.effort,
    durationMs: Date.now() - startedAt,
    requestId,
    fallbackUsed: false,
    result
  });
}

async function withSecurity(response) {
  const headers = securityHeaders(new Headers(response.headers));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          app: "OpenAdOps",
          version: APP_VERSION,
          runtime: "cloud",
          routing: "api-task-aware",
          providers: {
            api: { available: true },
            grok: { available: false, error: "公网版不能直接调用本机 Grok CLI，请使用 API 或下载本地版。" },
            codex: { available: false, error: "公网版不能直接调用本机 Codex CLI，请使用 API 或下载本地版。" }
          },
          apiRoutes: publicApiRoutes("openai"),
          aiBusy: false,
          activeJob: null
        });
      }
      if (request.method === "POST" && url.pathname === "/api/provider/test") return await handleProviderTest(request);
      if (request.method === "POST" && url.pathname === "/api/provider/generate") return await handleProviderGenerate(request, env);
      if (request.method === "POST" && url.pathname === "/api/cancel") {
        return jsonResponse({ ok: false, code: "NO_SERVER_CANCEL", error: "API 请求由当前浏览器取消。" }, 409);
      }
      if (url.pathname.startsWith("/api/")) {
        return jsonResponse({ ok: false, code: "NOT_FOUND", error: "接口不存在。" }, 404);
      }
      if (!env?.ASSETS?.fetch) return jsonResponse({ ok: false, error: "静态资源服务不可用。" }, 503);
      return await withSecurity(await env.ASSETS.fetch(request));
    } catch (error) {
      return errorResponse(error);
    }
  }
};
