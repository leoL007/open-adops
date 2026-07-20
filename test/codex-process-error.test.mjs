import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCodexProcessFailure,
  summarizeCodexDiagnostics
} from "../src/codex-process-error.mjs";

test("process signals are reported instead of exit code null", () => {
  const message = formatCodexProcessFailure({
    code: null,
    signal: "SIGTERM",
    stderr: "terminated"
  });

  assert.match(message, /信号 SIGTERM/);
  assert.doesNotMatch(message, /退出码 null/);
});

test("SIGKILL explains the likely external or resource cause", () => {
  const message = formatCodexProcessFailure({
    code: null,
    signal: "SIGKILL"
  });

  assert.match(message, /SIGKILL/);
  assert.match(message, /系统资源不足或外部进程管理器/);
});

test("numeric exit codes keep concise runtime diagnostics", () => {
  const message = formatCodexProcessFailure({
    code: 1,
    signal: null,
    stderr: "Error: connection reset"
  });

  assert.match(message, /退出码 1/);
  assert.match(message, /connection reset/);
});

test("large skill documentation is not exposed as the user-facing error", () => {
  const skillOutput = `---\nname: ads\ndescription: paid advertising skill\n## Reference Files\n${"documentation line\n".repeat(500)}GOOGLE_API_KEY`;
  const detail = summarizeCodexDiagnostics({ stderr: skillOutput });

  assert.equal(detail, "Codex CLI 输出主要是 Skill 加载日志，已省略无关内容。");
  assert.doesNotMatch(detail, /GOOGLE_API_KEY/);
  assert.ok(detail.length < 100);
});

test("missing process output receives a useful fallback", () => {
  assert.equal(summarizeCodexDiagnostics(), "无可用诊断信息");
});
