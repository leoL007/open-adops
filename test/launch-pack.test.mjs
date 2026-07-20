import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildMockLaunchPack } from "../public/lib/mock-launch-pack.js";
import { validateLaunchPack } from "../src/launch-pack-validator.mjs";

const cases = JSON.parse(await readFile(new URL("../evals/launch-pack-cases.json", import.meta.url), "utf8"));

test("deterministic Launch Pack cases pass product acceptance rules", async (t) => {
  for (const fixture of cases) {
    await t.test(fixture.id, () => {
      const result = buildMockLaunchPack(fixture.project);
      assert.deepEqual(validateLaunchPack(result), { valid: true, errors: [] });
      assert.equal(result.media_plan.length, fixture.expect.platformCount);
      const allocations = result.media_plan.map((item) => item.allocation_percent);
      const amounts = result.media_plan.map((item) => item.budget_amount);
      if (fixture.expect.budgetAmounts) assert.ok(amounts.every((value) => typeof value === "number"));
      else assert.ok(amounts.every((value) => value === null));
      if (fixture.expect.allocationTotal) assert.equal(allocations.reduce((sum, value) => sum + value, 0), fixture.expect.allocationTotal);
      if (fixture.expect.complianceBlocker) assert.ok(result.launch_checklist.some((item) => item.category === "compliance" && item.status === "blocker"));
      if (fixture.expect.activePlatformMax) assert.ok(result.media_plan.filter((item) => Number(item.budget_amount) > 0).length <= fixture.expect.activePlatformMax);
      assert.ok(result.campaigns.every((item) => item.campaign_name && item.optimization_event && item.bidding));
      assert.ok(result.creative_briefs.every((item) => item.hypothesis && item.test_variable && item.success_metric));
    });
  }
});

test("Launch Pack validator rejects inconsistent blocker summary", () => {
  const result = buildMockLaunchPack(cases[0].project);
  result.readiness.blockers = [];
  const validation = validateLaunchPack(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /blocker/);
});

test("Launch Pack does not invent a CPA kill rule when no threshold is configured", () => {
  const result = buildMockLaunchPack({
    name: "Learning App",
    platforms: ["Google Ads"],
    markets: "US",
    budget: 3000,
    currency: "USD",
    goal: "Purchase",
    performanceTargets: []
  });
  assert.match(result.first_7_days[2].decision_rule, /没有已确认阈值/);
  assert.doesNotMatch(result.first_7_days[2].decision_rule, /CPA 3 倍|目标 CPA/);
});

test("Launch Pack applies a CPA multiple rule only to an explicit threshold", () => {
  const result = buildMockLaunchPack({
    name: "CPA App",
    platforms: ["Google Ads"],
    markets: "US",
    budget: 3000,
    currency: "USD",
    goal: "Purchase",
    performanceTargets: [{ id: "t1", metric: "cpa", status: "test", value: 12, event: "Purchase", primary: true }]
  });
  assert.match(result.first_7_days[2].decision_rule, /CPA 阈值 USD 12 的 3 倍/);
});
