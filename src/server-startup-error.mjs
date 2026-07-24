export function formatServerStartupError(error, { port = 4173 } = {}) {
  if (error?.code === "EADDRINUSE") {
    return `OpenAdOps 无法启动：端口 ${port} 已被占用。工作台可能已经运行；如刚更新版本，请先停止旧进程后重新执行 npm start。`;
  }

  if (error?.code === "EPERM" || error?.code === "EACCES") {
    return `OpenAdOps 无法监听 127.0.0.1:${port}：当前终端没有本地监听权限。请检查 macOS 终端权限后重试。`;
  }

  const detail = String(error?.message || error || "未知错误").trim();
  return `OpenAdOps 启动失败：${detail}`;
}
