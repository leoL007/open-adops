import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePerformanceTargets,
  performanceTargetsForAi,
  primaryTargetText,
  targetHint
} from "../public/lib/project-targets.js";

test("zero legacy KPI fields migrate to an explicit missing target state", () => {
  const project = { currency: "USD", targetCpi: 0, targetCpa: 0, targetRoas: 0 };
  assert.deepEqual(normalizePerformanceTargets(project), []);
  assert.deepEqual(performanceTargetsForAi(project), { status: "missing", reviewCondition: null, items: [] });
});

test("positive legacy KPI fields migrate without mixing metric identities", () => {
  const project = { currency: "USD", goal: "Purchase", targetCpi: 2.2, targetCpa: 15, targetRoas: 1.2 };
  const targets = normalizePerformanceTargets(project);
  assert.deepEqual(targets.map((item) => item.metric), ["af_cpi", "cpa", "roas"]);
  assert.equal(targets[0].primary, true);
  assert.equal(targets[1].event, "Purchase");
  assert.equal(targets.filter((item) => item.primary).length, 1);
});

test("an explicit empty target list does not remigrate deleted legacy fields", () => {
  const project = { targetCpi: 2.2, performanceTargets: [] };
  assert.deepEqual(normalizePerformanceTargets(project), []);
});

test("observation targets keep values null and AI input exposes missing thresholds", () => {
  const project = {
    currency: "USD",
    targetReview: "运行 7 天后复盘",
    performanceTargets: [{ id: "t1", metric: "af_cpi", status: "observe", value: 2.2, primary: true }]
  };
  const target = normalizePerformanceTargets(project)[0];
  assert.equal(target.value, null);
  assert.equal(targetHint(project, "af_cpi"), "仅观察 · 暂无阈值");
  assert.equal(primaryTargetText(project), "AF-CPI 仅观察，暂无阈值");
  assert.equal(performanceTargetsForAi(project).items[0].value, null);
});

test("CPA event and ROAS window remain explicit in AI input", () => {
  const project = {
    currency: "USD",
    performanceTargets: [
      { id: "t1", metric: "cpa", status: "test", value: 15, event: "Purchase", primary: true },
      { id: "t2", metric: "roas", status: "formal", value: 1.2, window: "D7", primary: false }
    ]
  };
  const input = performanceTargetsForAi(project);
  assert.equal(input.items[0].event, "Purchase");
  assert.equal(input.items[0].direction, "decrease");
  assert.equal(input.items[1].window, "D7");
  assert.equal(input.items[1].direction, "increase");
});
