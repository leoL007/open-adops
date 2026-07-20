const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const STRONG_ERROR_PATTERN = /^(?:error\b|fatal\b|fatal:|panic\b|npm err!|spawn\b|.*\b(?:permission denied|operation not permitted|command not found|rate limit(?:ed)?|quota exceeded|connection (?:refused|reset)|network error|timed out)\b)/i;
const SKILL_LOG_PATTERN = /(?:^---\s*$|^name:\s|^description:\s|^allowed-tools:\s|^#{1,6}\s|reference files|sub-skills|skill\.md|google_api_key|\/ads(?:\s|$))/im;

function clean(value) {
  return String(value || "")
    .replace(ANSI_PATTERN, "")
    .replace(/\r/g, "")
    .trim();
}

function clip(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

export function summarizeCodexDiagnostics({ stderr = "", stdout = "", maxLength = 1200 } = {}) {
  const diagnostic = clean(stderr) || clean(stdout);
  if (!diagnostic) return "无可用诊断信息";

  const strongErrors = diagnostic
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => STRONG_ERROR_PATTERN.test(line));

  if (strongErrors.length) {
    return clip([...new Set(strongErrors)].slice(-6).join("\n"), maxLength);
  }

  if (diagnostic.length > 3000 || SKILL_LOG_PATTERN.test(diagnostic)) {
    return "Codex CLI 输出主要是 Skill 加载日志，已省略无关内容。";
  }

  return clip(diagnostic, maxLength);
}

export function formatCodexProcessFailure({ code, signal, stderr = "", stdout = "" } = {}) {
  const detail = summarizeCodexDiagnostics({ stderr, stdout });

  if (signal) {
    const reason = signal === "SIGKILL"
      ? "可能由系统资源不足或外部进程管理器强制结束"
      : "可能由系统、终端或上层任务停止";
    return `Codex CLI 被信号 ${signal} 终止，未生成结果；${reason}。诊断：${detail}`;
  }

  if (Number.isInteger(code)) {
    return `Codex CLI 异常退出（退出码 ${code}），未生成结果。诊断：${detail}`;
  }

  return `Codex CLI 异常结束（未返回退出码），未生成结果。诊断：${detail}`;
}
