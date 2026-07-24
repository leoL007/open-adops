import path from "node:path";

export function resolveStaticFile(pathname, publicRoot) {
  const root = path.resolve(publicRoot);
  let decoded;
  try {
    decoded = decodeURIComponent(String(pathname || "/"));
  } catch {
    return { ok: false, status: 400, error: "请求路径编码无效" };
  }

  if (decoded.includes("\0")) {
    return { ok: false, status: 400, error: "请求路径包含无效字符" };
  }

  const requested = decoded === "/"
    ? "/index.html"
    : decoded.startsWith("/")
      ? decoded
      : `/${decoded}`;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    return { ok: false, status: 403, error: "禁止访问" };
  }

  return { ok: true, filePath };
}

export function shouldSendStaticBody(method) {
  return String(method || "GET").toUpperCase() !== "HEAD";
}
