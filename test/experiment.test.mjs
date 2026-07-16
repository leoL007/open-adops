import test from "node:test";
import assert from "node:assert/strict";
import {
  applyExperimentMetricContext,
  calculateExperimentFeasibility,
  enrichExperimentPlan,
  experimentConclusionComplete,
  normalizeExperimentDesign
} from "../public/lib/experiments.js";
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

test("experiment design normalizes editable duration boundaries", () => {
  assert.deepEqual(
    normalizeExperimentDesign({ ...baseDesign, minimum_days: null, maximum_days: 2 }),
    { ...baseDesign, minimum_days: 7, maximum_days: 7 }
  );
  assert.deepEqual(
    normalizeExperimentDesign({ ...baseDesign, minimum_days: 7.6, maximum_days: 2 }),
    { ...baseDesign, minimum_days: 8, maximum_days: 8 }
  );
});

test("concluded experiments require durable evidence and learning", () => {
  const complete = {
    result: {
      outcome: "winner",
      evidence: "TikTok Split Test result screenshot",
      learning: "Direct result proof improved registration rate.",
      next_action: "Apply the winner and test the next hook."
    }
  };
  assert.equal(experimentConclusionComplete(complete), true);
  assert.equal(experimentConclusionComplete({ result: { ...complete.result, evidence: "" } }), false);
  assert.equal(experimentConclusionComplete({ result: { ...complete.result, outcome: "pending" } }), false);
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

test("mock Experiment Ledger normalizes platform labels and sizes the actual rate metric", () => {
  const project = {
    name: "Finance App",
    platforms: ["Google Ads"],
    creativePlan: [{
      platform: "Google Ads",
      angle: "Trust",
      hook: "See the process first",
      variable: "Opening proof",
      metric: "注册率"
    }],
    data: {
      metrics: {
        period: { activeDays: 2 },
        summary: { clicks: 9000, conversions: 2700, cvr: 0.3 },
        byPlatform: [{
          name: "googleadwords_int",
          clicks: 1000,
          impressions: 10000,
          conversions: 50,
          cvr: 0.2,
          ctr: 0.1,
          period: { activeDays: 2 }
        }]
      }
    }
  };
  const plan = buildMockExperimentPlan(project);
  const experiment = plan.experiments[0];
  assert.equal(experiment.design.primary_metric, "注册率");
  assert.equal(experiment.design.metric_type, "rate");
  assert.equal(experiment.design.baseline_rate_percent, 5);
  assert.equal(experiment.design.daily_eligible_units, 500);
  assert.match(experiment.design.test_type, /Google Ads/);
});

test("specific business events take precedence over generic CVR labels", () => {
  const project = {
    name: "Finance App",
    platforms: ["Meta Ads"],
    creativePlan: [{
      platform: "Meta Ads",
      angle: "Trust",
      hook: "Show proof",
      variable: "Opening",
      metric: "注册 CVR"
    }],
    data: {
      metrics: {
        period: { activeDays: 1 },
        byPlatform: [{
          name: "Facebook Ads",
          clicks: 1000,
          conversions: 50,
          cvr: 0.2,
          period: { activeDays: 1 }
        }]
      }
    }
  };
  assert.equal(buildMockExperimentPlan(project).experiments[0].design.baseline_rate_percent, 5);
});

test("mock Experiment Ledger does not borrow account averages for an unmatched platform", () => {
  const project = {
    name: "Tool App",
    platforms: ["Google Ads"],
    creativePlan: [{
      platform: "Google Ads",
      angle: "Outcome",
      hook: "Show the output",
      variable: "First frame",
      metric: "CVR"
    }],
    data: {
      metrics: {
        period: { activeDays: 2 },
        summary: { clicks: 10000, cvr: 0.25 },
        byPlatform: [{ name: "Facebook Ads", clicks: 10000, cvr: 0.25, period: { activeDays: 2 } }]
      }
    }
  };
  const experiment = buildMockExperimentPlan(project).experiments[0];
  assert.equal(experiment.design.baseline_rate_percent, null);
  assert.equal(experiment.design.daily_eligible_units, null);
  assert.equal(experiment.feasibility.status, "not_calculable");
});

test("AI experiment metric inputs are replaced by deterministic matching data", () => {
  const plan = buildMockExperimentPlan({
    name: "Finance App",
    platforms: ["Google Ads"],
    creativePlan: [{
      platform: "Google Ads",
      angle: "Trust",
      hook: "Show proof",
      variable: "Opening",
      metric: "注册率"
    }]
  });
  plan.experiments[0].design.baseline_rate_percent = 99;
  plan.experiments[0].design.daily_eligible_units = 99999;
  const normalized = applyExperimentMetricContext(plan, {
    period: { activeDays: 2 },
    summary: { clicks: 9000, conversions: 2700, cvr: 0.3 },
    byPlatform: [{
      name: "googleadwords_int",
      clicks: 1000,
      conversions: 50,
      cvr: 0.2,
      period: { activeDays: 2 }
    }]
  });
  assert.equal(normalized.experiments[0].design.baseline_rate_percent, 5);
  assert.equal(normalized.experiments[0].design.daily_eligible_units, 500);
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

test("validator rejects non-positive experiment sizing inputs", () => {
  const project = {
    name: "Tool App",
    platforms: ["Meta Ads"],
    creativePlan: [{ platform: "Meta Ads", angle: "Outcome", hook: "Show it", variable: "Opening", metric: "CVR" }]
  };
  const plan = buildMockExperimentPlan(project);
  plan.experiments[0].design.mde_percent = -10;
  plan.experiments[0].design.daily_eligible_units = 0;
  const validation = validateExperimentPlan(enrichExperimentPlan(plan));
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /mde_percent 必须大于 0/);
  assert.match(validation.errors.join(" "), /daily_eligible_units 必须大于 0/);
});
