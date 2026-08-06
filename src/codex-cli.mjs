import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";

function defaultIsExecutable(filePath, platform = process.platform) {
  try {
    accessSync(filePath, platform === "win32" ? constants.F_OK : constants.X_OK);
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
  const pathApi = platform === "win32" ? path.win32 : path;
  const delimiter = platform === "win32" ? ";" : path.delimiter;
  const commandNames = platform === "win32"
    ? ["codex.exe", "codex.cmd", "codex.bat", "codex"]
    : ["codex"];

  addCandidate(candidates, seen, env.CODEX_BIN, "CODEX_BIN");

  for (const directory of String(env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    for (const commandName of commandNames) {
      addCandidate(candidates, seen, pathApi.join(directory, commandName), "PATH");
    }
  }

  if (platform === "darwin") {
    addCandidate(candidates, seen, "/Applications/ChatGPT.app/Contents/Resources/codex", "ChatGPT App");
    addCandidate(candidates, seen, "/opt/homebrew/bin/codex", "Homebrew");
    addCandidate(candidates, seen, "/usr/local/bin/codex", "系统命令目录");
  }

  if (platform === "win32") {
    const standaloneBin = env.LOCALAPPDATA
      ? pathApi.join(env.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin")
      : "";
    const npmBin = env.APPDATA ? pathApi.join(env.APPDATA, "npm") : "";
    for (const commandName of commandNames) {
      if (standaloneBin) addCandidate(candidates, seen, pathApi.join(standaloneBin, commandName), "Codex 安装目录");
      if (npmBin) addCandidate(candidates, seen, pathApi.join(npmBin, commandName), "npm 全局目录");
    }
  }

  if (homeDir) {
    for (const commandName of commandNames) {
      addCandidate(
        candidates,
        seen,
        pathApi.join(homeDir, ".codex", "plugins", ".plugin-appserver", commandName),
        "Codex 插件目录"
      );
    }
  }

  return candidates;
}

export function resolveCodexCli(options = {}) {
  const platform = options.platform || process.platform;
  const isExecutable = options.isExecutable || ((candidate) => defaultIsExecutable(candidate, platform));
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

export function codexCommandNeedsShell(command, platform = process.platform) {
  return platform === "win32" && /\.(?:cmd|bat)$/i.test(String(command || ""));
}

export function probeCodexCli(
  resolution,
  { spawnSyncImpl = spawnSync, platform = process.platform } = {}
) {
  const missingMessage = "未找到 Codex CLI。已检查 CODEX_BIN、PATH、ChatGPT App 和 Codex 插件目录；请更新或重新打开 ChatGPT，或设置 CODEX_BIN 后重启 OpenAdOps。";
  if (!resolution?.available) {
    return { ...resolution, available: false, version: "", error: missingMessage };
  }

  const result = spawnSyncImpl(resolution.command, ["--version"], {
    encoding: "utf8",
    shell: codexCommandNeedsShell(resolution.command, platform),
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
