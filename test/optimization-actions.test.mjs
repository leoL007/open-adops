import test from "node:test";
import assert from "node:assert/strict";
import {
  actionMetricChange,
  actionsFromAnalysis,
  inferOptimizationActionCategory,
  normalizeOptimizationActions,
  optimizationReviewFeishuTable,
  updateOptimizationAction
} from "../public/lib/optimization-actions.js";

const analysis = {
  findings: [
    {
      title: "Meta 素材疲劳",
      evidence: "近 7 天 CTR 下降 18%，AF-CPI 上升 22%。",
      action: "补充 3 组新 Hook 素材，其他变量保持一致。",
      validation: "观察下一周期 CTR 与 AF-CPI。"
    },
    {
      title: "归因差异扩大",
      evidence: "媒体安装与 AF 安装差异为 19%。",
      action: "复核 AppsFlyer 事件映射与回传窗口。",
      validation: "安装差异回落并形成可解释口径。"
    }
  ],
  next_actions: [
    { action: "生产新素材", owner: "优化师 + 设计", timing: "本周", success_metric: "AF-CPI" },
    { action: "复核归因", owner: "优化师", timing: "今天", success_metric: "AF 安装差异" }
  ]
};

test("analysis findings become stable operator-owned actions", () => {
  const actions = actionsFromAnalysis(analysis, { runId: "run-1" });
  assert.equal(actions.length, 2);
  assert.equal(actions[0].id, "run-1-action-1");
  assert.equal(actions[0].category, "creative");
  assert.equal(actions[0].owner, "优化师 + 设计");
  assert.equal(actions[1].category, "tracking");
});

test("legacy runs derive actions when no action array exists", () => {
  const actions = normalizeOptimizationActions(undefined, analysis, { runId: "legacy-run" });
  assert.deepEqual(actions.map((action) => action.id), ["legacy-run-action-1", "legacy-run-action-2"]);
});

test("action updates require a conclusion before validated", () => {
  const actions = actionsFromAnalysis(analysis, { runId: "run-1" });
  assert.throws(
    () => updateOptimizationAction(actions, actions[0].id, { status: "validated", resultNote: "" }),
    /验证结论/
  );
  const updated = updateOptimizationAction(actions, actions[0].id, {
    status: "validated",
    category: "creative",
    resultNote: "AF-CPI 下降，安装量稳定。"
  }, { now: "2026-08-05T08:00:00.000Z" });
  assert.equal(updated[0].status, "validated");
  assert.equal(updated[0].reviewedAt, "2026-08-05T08:00:00.000Z");
});

test("metric change calculates relative movement without judging success", () => {
  const action = { successMetric: "AF-CPI 下降", action: "观察成本" };
  const change = actionMetricChange(action, { afCpi: 4 }, { afCpi: 3 });
  assert.equal(change.metric.key, "afCpi");
  assert.equal(change.relativeChange, -25);
  assert.equal(change.trend, "down");
  assert.equal(change.assessment, undefined);
});

test("unknown metrics stay unavailable", () => {
  assert.deepEqual(
    actionMetricChange({ successMetric: "素材质量稳定" }, {}, {}),
    { available: false, reason: "未识别可计算指标" }
  );
});

test("missing metric values are not mistaken for zero", () => {
  const change = actionMetricChange(
    { successMetric: "AF-CPI" },
    { afCpi: null },
    { afCpi: 3 }
  );
  assert.equal(change.available, false);
  assert.equal(change.reason, "前后周期缺少该指标");
});

test("Feishu review output is a concise rich table", () => {
  const actions = actionsFromAnalysis(analysis, { runId: "run-1" });
  const output = optimizationReviewFeishuTable(actions, {
    statusLabel: (status) => status === "pending" ? "待确认" : status
  });
  assert.match(output.html, /^<table>/);
  assert.match(output.html, /数据证据/);
  assert.doesNotMatch(output.html, /<h1>|<h2>/);
  assert.match(output.text, /问题\t数据证据\t优化动作/);
  assert.match(output.text, /待确认/);
});

test("category inference covers the main optimization destinations", () => {
  assert.equal(inferOptimizationActionCategory("补充三组视频素材"), "creative");
  assert.equal(inferOptimizationActionCategory("检查 AppsFlyer 回传"), "tracking");
  assert.equal(inferOptimizationActionCategory("提高测试预算 20%"), "budget");
  assert.equal(inferOptimizationActionCategory("调整 Campaign 国家结构"), "structure");
});
