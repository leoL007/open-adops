import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_STAGES, normalizeProjectStage } from "../public/lib/project-stage.js";

test("project stages remove preparation while preserving later phases", () => {
  assert.deepEqual(PROJECT_STAGES, ["测试期", "放量期", "稳定期"]);
  assert.equal(normalizeProjectStage("准备期"), "测试期");
  assert.equal(normalizeProjectStage("测试期"), "测试期");
  assert.equal(normalizeProjectStage("放量期"), "放量期");
  assert.equal(normalizeProjectStage("稳定期"), "稳定期");
});
