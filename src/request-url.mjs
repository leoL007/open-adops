const LOCAL_BASE_URL = "http://127.0.0.1";

export function parseRequestUrl(requestUrl) {
  try {
    return {
      ok: true,
      url: new URL(String(requestUrl || "/"), LOCAL_BASE_URL)
    };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "请求地址无效"
    };
  }
}
