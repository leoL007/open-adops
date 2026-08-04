import test from "node:test";
import assert from "node:assert/strict";
import { buildMockCreativeRequirements } from "../public/lib/mock-creative-requirements.js";
import { validateCreativeRequirements } from "../src/creative-requirements-validator.mjs";

test("social creative requirements include adult, rights and manual policy checks", () => {
  const result = buildMockCreativeRequirements({
    name: "Local Single",
    industry: "社交",
    platforms: ["Meta Ads"],
    markets: "US"
  }, { notes: "真人美女口播，统一加尾板" });
  assert.equal(validateCreativeRequirements(result).valid, true);
  assert.ok(result.guidance.some((item) => item.item.includes("成年")));
  assert.ok(result.guidance.some((item) => item.status === "confirm"));
  assert.ok(result.suggestions.some((item) => item.quantity > 0));
  assert.ok(result.suggestions.some((item) => item.quantity === null));
  assert.ok(result.suggestions.every((item) => item.asset_reference === ""));
});

test("finance creative requirements avoid invented performance thresholds", () => {
  const result = buildMockCreativeRequirements({ industry: "金融", platforms: ["TikTok Ads"], markets: "BR" });
  assert.equal(validateCreativeRequirements(result).valid, true);
  assert.ok(result.guidance.some((item) => item.item.includes("收益")));
  assert.doesNotMatch(JSON.stringify(result), /CTR|CPI|CPA|ROAS|提升\s*\d+%/i);
});

test("validator rejects placeholder output and duplicate suggestion ids", () => {
  const result = buildMockCreativeRequirements({ industry: "工具", platforms: ["Google Ads"], markets: "JP" });
  result.suggestions[0].modification_notes = "...";
  result.suggestions[1].id = result.suggestions[0].id;
  const validation = validateCreativeRequirements(result);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((item) => item.includes("modification_notes")));
  assert.ok(validation.errors.some((item) => item.includes("重复")));
});

test("validator allows missing reference, copy, format and quantity without inventing values", () => {
  const result = buildMockCreativeRequirements({ industry: "工具", platforms: ["Google Ads"], markets: "JP" });
  result.suggestions[0].asset_reference = "";
  result.suggestions[0].copy = "";
  result.suggestions[0].format = "";
  result.suggestions[0].quantity = null;
  assert.equal(validateCreativeRequirements(result).valid, true);
});

test("validator rejects AI-invented asset references", () => {
  const result = buildMockCreativeRequirements({ industry: "工具", platforms: ["Google Ads"], markets: "JP" });
  result.suggestions[0].asset_reference = "https://example.com/invented-reference";
  const validation = validateCreativeRequirements(result);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((item) => item.includes("asset_reference 必须留空")));
});
