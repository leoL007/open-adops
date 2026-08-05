#!/bin/zsh

set -u
unsetopt BG_NICE

PROJECT_DIR="${0:A:h}"
PORT="${PORT:-4173}"
BASE_URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${OPENADOPS_HEALTH_URL:-${BASE_URL}/api/health}"
APP_URL="${OPENADOPS_URL:-${BASE_URL}/#overview}"
export PORT
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.grok/bin:${HOME}/.local/bin:${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"

print ""
print "OpenAdOps 简易启动"
print "=================="

pause_after_error() {
  print ""
  read "?按回车关闭窗口…"
}

fail() {
  print -u2 "✗ $1"
  pause_after_error
  exit 1
}

health_response() {
  /usr/bin/curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null
}

is_openadops_running() {
  local response
  response="$(health_response)" || return 1
  [[ "$response" == *'"ok":true'* && "$response" == *'"app":"OpenAdOps"'* ]]
}

open_workbench() {
  if [[ "${OPENADOPS_NO_OPEN:-0}" != "1" ]]; then
    /usr/bin/open "$APP_URL" || return 1
  fi
}

port_is_occupied() {
  if [[ -x /usr/sbin/lsof ]]; then
    /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  /usr/bin/nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1
}

cd "$PROJECT_DIR" 2>/dev/null || fail "macOS 无法访问 OpenAdOps 目录。请在“系统设置 → 隐私与安全性”中允许终端访问文稿文件夹。"
[[ -f package.json && -f server.mjs ]] || fail "启动器不在完整的 OpenAdOps 仓库中。"

if is_openadops_running; then
  print "✓ OpenAdOps 已在运行，正在打开工作台…"
  open_workbench || fail "无法自动打开浏览器，请手动访问 ${APP_URL}"
  exit 0
fi

if port_is_occupied; then
  fail "端口 ${PORT} 已被其他程序占用。请先关闭占用程序，再重新双击启动。"
fi

command -v node >/dev/null 2>&1 || fail "没有找到 Node.js。请先安装 Node.js 20 或更高版本。"
command -v npm >/dev/null 2>&1 || fail "没有找到 npm。请重新安装 Node.js 20 或更高版本。"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)"
[[ "$NODE_MAJOR" == <-> && "$NODE_MAJOR" -ge 20 ]] || fail "当前 Node.js 版本过低，需要 Node.js 20 或更高版本。"

print "✓ 环境检查通过"
print "→ 正在启动本地服务…"
print ""

npm start &
SERVER_PID=$!

stop_server() {
  print ""
  print "→ 正在停止 OpenAdOps…"
  kill -TERM "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
  exit 0
}

trap stop_server INT TERM HUP

READY=0
for _ in {1..60}; do
  if is_openadops_running; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if [[ "$READY" != "1" ]]; then
  kill -TERM "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
  trap - INT TERM HUP
  fail "OpenAdOps 未能成功启动。请查看上方日志，或在仓库中运行 npm run doctor。"
fi

print "✓ OpenAdOps 已启动：${APP_URL}"
if ! open_workbench; then
  kill -TERM "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" >/dev/null 2>&1 || true
  trap - INT TERM HUP
  fail "服务已启动，但无法自动打开浏览器。请手动访问 ${APP_URL}"
fi
print ""
print "工作台正在运行。按 Control + C 可停止服务。"

wait "$SERVER_PID"
EXIT_CODE=$?
trap - INT TERM HUP

if [[ "$EXIT_CODE" -ne 0 ]]; then
  fail "OpenAdOps 服务异常退出（退出码 ${EXIT_CODE}）。"
fi
