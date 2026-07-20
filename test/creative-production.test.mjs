import test from "node:test";
import assert from "node:assert/strict";
import {
  creativeProductionCsv,
  creativeProductionMarkdown,
  creativeProductionSummary,
  legacyCreativePlan,
  normalizeCreativeProduction,
  normalizeCreativeTask,
  replaceGeneratedCreativeTasks,
  tasksFromCreativeBriefs,
  tasksFromCreativeTests
} from "../public/lib/creative-production.js";

function ids() {
  let index = 0;
  return () => `task-${++index}`;
}

test("legacy projects prefer launch briefs and preserve production detail", () => {
  const project = {
    platforms: ["TikTok Ads"],
    markets: "JP",
    creativePlan: [{ platform: "Meta Ads", angle: "old", hook: "old", variable: "old", metric: "CTR" }],
    launch: {
      pack: {
        result: {
          creative_briefs: [{
            id: "brief-1",
            platform: "TikTok Ads",
            hypothesis: "更直接的演示可提高转化",
            angle: "真实演示",
            hook: "先看三步结果",
            format: "9:16 录屏视频",
            variants: 3,
            test_variable: "首帧 Hook",
            success_metric: "AF-CPI",
            production_notes: ["字幕安全区"],
            compliance_notes: ["不承诺收益"]
          }]
        }
      }
    }
  };
  const production = normalizeCreativeProduction(project, { makeId: ids(), now: "2026-07-20T00:00:00.000Z" });
  assert.equal(production.tasks.length, 1);
  assert.equal(production.tasks[0].source, "launch_pack");
  assert.equal(production.tasks[0].quantity, 3);
  assert.equal(production.tasks[0].deliverable, "视频");
  assert.equal(production.tasks[0].market, "JP");
  assert.equal(production.tasks[0].complianceNotes, "不承诺收益");
});

test("legacy creative plans become production tasks without inventing deadlines or thresholds", () => {
  const project = { markets: "GB", platforms: ["Meta Ads"], creativePlan: [{ platform: "Meta Ads", angle: "信任", hook: "先解释流程", variable: "首帧", metric: "观察 CPA" }] };
  const tasks = normalizeCreativeProduction(project, { makeId: ids(), now: "2026-07-20T00:00:00.000Z" }).tasks;
  assert.equal(tasks[0].market, "GB");
  assert.equal(tasks[0].dueDate, "");
  assert.equal(tasks[0].successMetric, "观察 CPA");
  assert.equal(tasks[0].status, "backlog");
  assert.equal(tasks[0].source, "legacy");
});

test("regeneration preserves manual tasks and operational edits for matching generated tasks", () => {
  const makeId = ids();
  const manual = normalizeCreativeTask({ source: "manual", angle: "人工补充", owner: "Leo" }, { makeId, now: "2026-07-20T00:00:00.000Z" });
  const previous = normalizeCreativeTask({ source: "analysis", sourceKey: "analysis:Meta Ads:1", platform: "Meta Ads", angle: "旧角度", owner: "设计 A", quantity: 4, dueDate: "2026-07-25", status: "in_progress" }, { makeId, now: "2026-07-20T00:00:00.000Z" });
  const generated = tasksFromCreativeTests([{ platform: "Meta Ads", angle: "新角度", hook: "新 Hook", variable: "首帧", metric: "CTR" }], { platforms: ["Meta Ads"] }, { makeId, now: "2026-07-21T00:00:00.000Z" });
  const result = replaceGeneratedCreativeTasks([manual, previous], generated, "analysis", { makeId, now: "2026-07-21T00:00:00.000Z" });
  assert.equal(result.length, 2);
  assert.equal(result[0].angle, "人工补充");
  assert.equal(result[1].angle, "新角度");
  assert.equal(result[1].owner, "设计 A");
  assert.equal(result[1].quantity, 4);
  assert.equal(result[1].status, "in_progress");
});

test("launch briefs replace prior generated tasks but keep manual additions", () => {
  const makeId = ids();
  const manual = normalizeCreativeTask({ source: "manual", angle: "人工任务" }, { makeId });
  const analysis = normalizeCreativeTask({ source: "analysis", angle: "旧 AI 任务" }, { makeId });
  const launch = tasksFromCreativeBriefs([{ id: "launch-1", platform: "Google Ads", angle: "功能证明", hook: "展示结果", hypothesis: "提升转化", format: "视频", variants: 2, test_variable: "开场", success_metric: "AF-CPI", production_notes: [], compliance_notes: [] }], { platforms: ["Google Ads"], markets: "US" }, { makeId });
  const result = replaceGeneratedCreativeTasks([manual, analysis], launch, "launch_pack", { makeId });
  assert.deepEqual(result.map((item) => item.angle), ["人工任务", "功能证明"]);
});

test("production summary, legacy projection, CSV and Markdown stay deterministic", () => {
  const tasks = [
    normalizeCreativeTask({ id: "a", platform: "Meta Ads", market: "US", deliverable: "视频", quantity: 3, owner: "A", dueDate: "2026-07-19", status: "review", angle: "结果", hook: "先看结果", testVariable: "首帧", successMetric: "CTR" }),
    normalizeCreativeTask({ id: "b", platform: "TikTok Ads", quantity: 2, status: "live", angle: "演示" })
  ];
  assert.deepEqual(creativeProductionSummary(tasks, "2026-07-20"), { tasks: 2, versions: 5, review: 1, completed: 1, overdue: 1 });
  assert.equal(legacyCreativePlan(tasks)[0].variable, "首帧");
  assert.match(creativeProductionCsv(tasks), /^\uFEFF媒体,市场/);
  assert.match(creativeProductionCsv(tasks), /Meta Ads,US/);
  assert.match(creativeProductionMarkdown({ name: "Demo", markets: "US", platforms: ["Meta Ads"] }, tasks, "0.4.7"), /Demo · 素材生产计划/);
});
