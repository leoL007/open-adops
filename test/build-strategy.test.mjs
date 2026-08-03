import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStrategyDecisionComplete,
  createBuildAdGroup,
  ensureBuildStrategy,
  normalizeBuildStrategy
} from "../public/lib/build-strategy.js";

const project = {
  platforms: ["TikTok Ads"],
  markets: "BR, VN",
  goal: "Purchase",
  strategy: { enabled: null, budgetShares: { "TikTok Ads": 100 } }
};

test("new projects keep build strategy undecided until the operator chooses", () => {
  const strategy = normalizeBuildStrategy(project);
  assert.equal(strategy.enabled, null);
  assert.deepEqual(strategy.adGroups, []);
  assert.equal(buildStrategyDecisionComplete(project), false);
});

test("not-required is a deliberate completed decision", () => {
  assert.equal(buildStrategyDecisionComplete({ ...project, strategy: { ...project.strategy, enabled: false } }), true);
});

test("enabling build strategy creates one concrete ad group", () => {
  const strategy = ensureBuildStrategy({ ...project, strategy: { ...project.strategy, enabled: true } }, {
    makeId: () => "group-1"
  });
  assert.equal(strategy.adGroups.length, 1);
  assert.deepEqual(strategy.adGroups[0], {
    id: "group-1",
    name: "",
    platform: "TikTok Ads",
    market: "BR, VN",
    language: "",
    optimizationEvent: "Purchase",
    bidding: "",
    placements: "媒体默认版位",
    exclusions: "",
    creativeDirection: "",
    assetCount: 0
  });
});

test("legacy strategy content remains enabled during migration", () => {
  const strategy = normalizeBuildStrategy({
    ...project,
    strategy: { objective: "旧版阶段目标", testLogic: "旧版测试逻辑", budgetShares: {} }
  });
  assert.equal(strategy.enabled, true);
  assert.equal(strategy.objective, "旧版阶段目标");
});

test("ad group counts cannot be negative", () => {
  const group = createBuildAdGroup(project, { assetCount: -3 }, { makeId: () => "g" });
  assert.equal(group.assetCount, 0);
});
