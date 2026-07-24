export class OpenAdOpsApiError extends Error {
  constructor(message, { code = "API_ERROR", status = 0 } = {}) {
    super(message);
    this.name = "OpenAdOpsApiError";
    this.code = code;
    this.status = status;
  }
}

function statusCode(status) {
  return Number.isInteger(status) ? status : 0;
}

function defaultHttpCode(status) {
  if (status === 409) return "AI_BUSY";
  if (status === 499) return "CANCELLED";
  return "HTTP_ERROR";
}

export async function requestJson(url, options = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new OpenAdOpsApiError("当前浏览器不支持网络请求。", { code: "FETCH_UNAVAILABLE" });
  }

  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw new OpenAdOpsApiError(
      "无法连接本机 OpenAdOps 服务，请确认 npm start 正在运行后重试。",
      { code: "NETWORK_ERROR" }
    );
  }

  const status = statusCode(response?.status);
  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new OpenAdOpsApiError(
      "本机服务响应读取失败，请重启 OpenAdOps 后重试。",
      { code: "RESPONSE_READ_FAILED", status }
    );
  }

  let payload = {};
  if (String(raw || "").trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new OpenAdOpsApiError(
        "本机服务返回了无法识别的内容，请确认启动地址与端口正确。",
        { code: "INVALID_RESPONSE", status }
      );
    }
  }

  if (!response.ok || payload?.ok === false) {
    throw new OpenAdOpsApiError(
      payload?.error || `本机服务请求失败（HTTP ${status || "未知"}）`,
      {
        code: payload?.code || defaultHttpCode(status),
        status
      }
    );
  }

  return payload;
}

export function isCancelledRequest(error) {
  return error?.code === "CANCELLED" || error?.status === 499;
}

function normalizedVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

export function runtimeVersionWarning(appVersion, serverVersion) {
  const page = normalizedVersion(appVersion);
  const runtime = normalizedVersion(serverVersion);

  if (!runtime) {
    return "本机服务未返回版本信息，可能仍是旧进程。请停止旧进程后重新运行 npm start。";
  }
  if (!page || page === runtime) return "";
  return `页面版本 v${page} 与本机服务 v${runtime} 不一致。请停止旧进程后重新运行 npm start。`;
}
