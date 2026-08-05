import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";

function defaultIsExecutable(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function addCandidate(candidates, seen, filePath, source) {
  const normalized = String(filePath || "").trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  candidates.push({ command: normalized, source });
}

export function codexCliCandidates({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir()
} = {}) {
  const candidates = [];
  const seen = new Set();

  addCandidate(candidates, seen, env.CODEX_BIN, "CODEX_BIN");

  for (const directory of String(env.PATH || "").split(path.delimiter)) {
    if (directory) addCandidate(candidates, seen, path.join(directory, "codex"), "PATH");
  }

  if (platform === "darwin") {
    addCandidate(candidates, seen, "/Applications/ChatGPT.app/Contents/Resources/codex", "ChatGPT App");
    addCandidate(candidates, seen, "/opt/homebrew/bin/codex", "Homebrew");
    addCandidate(candidates, seen, "/usr/local/bin/codex", "系统命令目录");
  }

  if (homeDir) {
    addCandidate(
      candidates,
      seen,
      path.join(homeDir, ".codex", "plugins", ".plugin-appserver", "codex"),
      "Codex 插件目录"
    );
  }

  return candidates;
}

export function resolveCodexCli(options = {}) {
  const isExecutable = options.isExecutable || defaultIsExecutable;
  const candidates = codexCliCandidates(options);
  const selected = candidates.find((candidate) => isExecutable(candidate.command));

  if (selected) {
    return {
      available: true,
      command: selected.command,
      source: selected.source,
      attempted: candidates.map((candidate) => candidate.command)
    };
  }

  return {
    available: false,
    command: "codex",
    source: "未找到",
    attempted: candidates.map((candidate) => candidate.command)
  };
}

function versionLine(stdout, stderr) {
  const lines = `${stdout || ""}\n${stderr || ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /^codex(?:-cli)?\b/i.test(line)) || lines.at(-1) || "版本未知";
}

export function probeCodexCli(
  resolution,
  { spawnSyncImpl = spawnSync } = {}
) {
  const missingMessage = "未找到 Codex CLI。已检查 CODEX_BIN、PATH、ChatGPT App 和 Codex 插件目录；请更新或重新打开 ChatGPT，或设置 CODEX_BIN 后重启 OpenAdOps。";
  if (!resolution?.available) {
    return { ...resolution, available: false, version: "", error: missingMessage };
  }

  const result = spawnSyncImpl(resolution.command, ["--version"], {
    encoding: "utf8",
    shell: false,
    timeout: 5000
  });

  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr?.trim() || `退出码 ${result.status}`;
    return {
      ...resolution,
      available: false,
      version: "",
      error: `Codex CLI 自检失败（${resolution.source}）：${detail}。请设置 CODEX_BIN 后重启 OpenAdOps。`
    };
  }

  return {
    ...resolution,
    available: true,
    version: versionLine(result.stdout, result.stderr),
    error: ""
  };
}

export function detectCodexCli(options = {}) {
  return probeCodexCli(resolveCodexCli(options), options);
}
