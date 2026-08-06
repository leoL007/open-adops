import test from "node:test";
import assert from "node:assert/strict";
import { codexCommandNeedsShell, detectCodexCli, resolveCodexCli } from "../src/codex-cli.mjs";

test("explicit CODEX_BIN wins when it is executable", () => {
  const result = resolveCodexCli({
    env: { CODEX_BIN: "/custom/codex", PATH: "/bin" },
    platform: "darwin",
    homeDir: "/Users/test",
    isExecutable: (candidate) => candidate === "/custom/codex"
  });

  assert.equal(result.available, true);
  assert.equal(result.command, "/custom/codex");
  assert.equal(result.source, "CODEX_BIN");
});

test("a stale CODEX_BIN falls back to the ChatGPT app binary", () => {
  const appBinary = "/Applications/ChatGPT.app/Contents/Resources/codex";
  const result = resolveCodexCli({
    env: { CODEX_BIN: "/old/codex", PATH: "/minimal/bin" },
    platform: "darwin",
    homeDir: "/Users/test",
    isExecutable: (candidate) => candidate === appBinary
  });

  assert.equal(result.available, true);
  assert.equal(result.command, appBinary);
  assert.equal(result.source, "ChatGPT App");
});

test("a minimal GUI PATH can fall back to the Codex plugin binary", () => {
  const pluginBinary = "/Users/test/.codex/plugins/.plugin-appserver/codex";
  const result = resolveCodexCli({
    env: { PATH: "/usr/bin:/bin" },
    platform: "darwin",
    homeDir: "/Users/test",
    isExecutable: (candidate) => candidate === pluginBinary
  });

  assert.equal(result.available, true);
  assert.equal(result.command, pluginBinary);
  assert.equal(result.source, "Codex 插件目录");
});

test("Windows discovers native and npm Codex launchers", () => {
  const npmLauncher = "C:\\Users\\test\\AppData\\Roaming\\npm\\codex.cmd";
  const result = resolveCodexCli({
    env: {
      PATH: "C:\\Windows\\System32;C:\\Tools",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
      APPDATA: "C:\\Users\\test\\AppData\\Roaming"
    },
    platform: "win32",
    homeDir: "C:\\Users\\test",
    isExecutable: (candidate) => candidate === npmLauncher
  });

  assert.equal(result.available, true);
  assert.equal(result.command, npmLauncher);
  assert.equal(result.source, "npm 全局目录");
});

test("missing Codex CLI receives an actionable diagnostic", () => {
  const result = detectCodexCli({
    env: { PATH: "/empty" },
    platform: "linux",
    homeDir: "/home/test",
    isExecutable: () => false
  });

  assert.equal(result.available, false);
  assert.match(result.error, /CODEX_BIN/);
  assert.match(result.error, /重启 OpenAdOps/);
});

test("Codex CLI probe exposes a clean version string", () => {
  const result = detectCodexCli({
    env: { CODEX_BIN: "/custom/codex", PATH: "" },
    platform: "linux",
    homeDir: "",
    isExecutable: (candidate) => candidate === "/custom/codex",
    spawnSyncImpl: () => ({
      status: 0,
      stdout: "codex-cli 0.147.0\n",
      stderr: "warning: alias unavailable\n"
    })
  });

  assert.equal(result.available, true);
  assert.equal(result.version, "codex-cli 0.147.0");
});

test("Windows cmd launchers are probed through the command shell", () => {
  let spawnOptions;
  const result = detectCodexCli({
    env: { CODEX_BIN: "C:\\Tools\\codex.cmd", PATH: "" },
    platform: "win32",
    homeDir: "",
    isExecutable: () => true,
    spawnSyncImpl: (_command, _args, options) => {
      spawnOptions = options;
      return { status: 0, stdout: "codex-cli 0.147.0\n", stderr: "" };
    }
  });

  assert.equal(result.available, true);
  assert.equal(spawnOptions.shell, true);
});

test("only Windows command wrappers require a shell", () => {
  assert.equal(codexCommandNeedsShell("C:\\Tools\\codex.cmd", "win32"), true);
  assert.equal(codexCommandNeedsShell("C:\\Tools\\codex.exe", "win32"), false);
  assert.equal(codexCommandNeedsShell("/usr/local/bin/codex", "darwin"), false);
});
