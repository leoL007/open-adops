import test from "node:test";
import assert from "node:assert/strict";
import { calculateExperimentFeasibility, enrichExperimentPlan } from "../public/lib/experiments.js";
import { buildMockExperimentPlan } from "../public/lib/mock-experiment-plan.js";
import { buildMockLaunchPack } from "../public/lib/mock-launch-pack.js";
import { validateExperimentPlan } from "../src/experiment-validator.mjs";

const baseDesign = {
  test_type: "A/B test",
  control: "Control",
  variant: "Variant",
  single_variable: "Hook",
  primary_metric: "CVR",
  metric_type: "rate",
  guardrail_metrics: ["CPA"],
  control_percent: 50,
  variant_percent: 50,
  baseline_rate_percent: 5,
  mde_percent: 20,
  daily_eligible_units: 2000,
  confidence_percent: 95,
  power_percent: 80,
  minimum_days: 7,
  maximum_days: 28
};

test("experiment calculator sizes a rate test deterministically", () => {
  const result = calculateExperimentFeasibility(baseDesign);
  assert.equal(result.required_sample_per_variant, 7457);
  assert.equal(result.estimated_duration_days, 8);
  assert.equal(result.status, "ready");
});

test("experiment calculator refuses false precision for cost metrics", () => {
  const result = calculateExperimentFeasibility({ ...baseDesign, metric_type: "cost" });
  assert.equal(result.required_sample_per_variant, null);
  assert.equal(result.estimated_duration_days, null);
  assert.equal(result.status, "not_calculable");
});

test("mock Experiment Ledger uses platform-native methods and validates", () => {
  const project = {
    name: "Nova Utility",
    industry: "工具",
    platforms: ["Google Ads", "Meta Ads", "TikTok Ads"],
    markets: "JP, US",
    budget: 30000,
    currency: "USD",
    goal: "Install",
    attribution: "AppsFlyer",
    strategy: { budgetShares: { "Google Ads": 40, "Meta Ads": 35, "TikTok Ads": 25 } },
    data: {
      metrics: {
        period: { startDate: "2026-07-01", endDate: "2026-07-02", activeDays: 2 },
        summary: { clicks: 6000, cvr: 0.15 },
        byPlatform: [
          { name: "Google Ads", clicks: 2200, cvr: 0.16, period: { activeDays: 2 } },
          { name: "Meta Ads", clicks: 2100, cvr: 0.14, period: { activeDays: 2 } },
          { name: "TikTok Ads", clicks: 1700, cvr: 0.12, period: { activeDays: 2 } }
        ]
      }
    }
  };
  const launchPack = buildMockLaunchPack(project);
  const plan = buildMockExperimentPlan(project, launchPack);
  const validation = validateExperimentPlan(plan);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.match(plan.experiments.find((item) => item.platform === "Google Ads").design.test_type, /App asset experiment/);
  assert.match(plan.experiments.find((item) => item.platform === "Meta Ads").design.test_type, /A\/B test/);
  assert.match(plan.experiments.find((item) => item.platform === "TikTok Ads").design.test_type, /Split Testing/);
  assert.equal(plan.experiments.every((item) => item.design.control_percent + item.design.variant_percent === 100), true);
});

test("mock Experiment Ledger keeps unavailable traffic inputs empty", () => {
  const project = {
    name: "Finance App",
    industry: "金融",
    platforms: ["Meta Ads"],
    markets: "ID",
    budget: 0,
    goal: "Registration",
    attribution: "AppsFlyer",
    creativePlan: [{ platform: "Meta Ads", angle: "信任证明", hook: "先看清流程", variable: "首帧信任信息", metric: "注册率" }]
  };
  const plan = buildMockExperimentPlan(project);
  assert.equal(plan.experiments[0].design.baseline_rate_percent, null);
  assert.equal(plan.experiments[0].design.daily_eligible_units, null);
  assert.equal(plan.experiments[0].feasibility.status, "not_calculable");
});

test("validator rejects a manipulated split and feasibility result", () => {
  const project = {
    name: "Tool App",
    platforms: ["Meta Ads"],
    creativePlan: [{ platform: "Meta Ads", angle: "结果前置", hook: "先看结果", variable: "首帧", metric: "CVR" }]
  };
  const plan = buildMockExperimentPlan(project);
  plan.experiments[0].design.control_percent = 70;
  plan.experiments[0].feasibility = enrichExperimentPlan(plan).experiments[0].feasibility;
  const validation = validateExperimentPlan(plan);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /合计必须为 100/);
});
