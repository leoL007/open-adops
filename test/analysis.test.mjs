import test from "node:test";
import assert from "node:assert/strict";
import { validateAnalysis } from "../src/analysis-validator.mjs";
import { buildMockAnalysis } from "../public/lib/mock-analysis.js";

test("deterministic mock output passes the same structural validation", () => {
  const result = buildMockAnalysis(
    { name: "Demo", platforms: ["Google Ads", "Meta Ads"], currency: "USD" },
    {
      summary: { spend: 1000, af_installs: 400, afCpi: 2.5, d1Retention: 0.3 },
      byPlatform: [{ name: "Meta Ads", spend: 600, af_installs: 200, afCpi: 3 }],
      byCountry: [{ name: "JP", spend: 400, af_installs: 200, afCpi: 2 }]
    }
  );
  assert.deepEqual(validateAnalysis(result), { valid: true, errors: [] });
});

test("mock analysis does not present unavailable efficiency as zero", () => {
  const result = buildMockAnalysis(
    { name: "Learning", platforms: ["Meta Ads"], currency: "USD" },
    {
      summary: { spend: 100, af_installs: 0, afCpi: null, d1Retention: null },
      byPlatform: [{ name: "Meta Ads", spend: 100, af_installs: 0, afCpi: null }],
      byCountry: []
    }
  );
  assert.match(result.executive_summary, /AF-CPI —/);
  assert.match(result.findings[0].title, /数据量不足/);
  assert.doesNotMatch(result.findings[0].evidence, /AF-CPI.*0/);
});

test("mock analysis uses a target multiple only when an AF-CPI threshold exists", () => {
  const metrics = {
    summary: { spend: 300, af_installs: 100, afCpi: 3, d1Retention: 0.2 },
    byPlatform: [
      { name: "Meta Ads", spend: 200, af_installs: 50, afCpi: 4 },
      { name: "Google Ads", spend: 100, af_installs: 50, afCpi: 2 }
    ],
    byCountry: []
  };
  const missing = buildMockAnalysis({ platforms: ["Meta Ads"], currency: "USD", performanceTargets: [] }, metrics);
  assert.match(missing.findings[0].action, /未设置 AF-CPI 阈值/);
  assert.doesNotMatch(missing.findings[0].action, /1\.3 倍/);

  const configured = buildMockAnalysis({
    platforms: ["Meta Ads"],
    currency: "USD",
    performanceTargets: [{
      id: "af-target",
      metric: "af_cpi",
      status: "test",
      value: 2.2,
      primary: true
    }]
  }, metrics);
  assert.match(configured.findings[0].action, /测试阈值 USD 2\.2 的 1\.3 倍/);
});

test("validator rejects incomplete or unsupported priority values", () => {
  const invalid = {
    executive_summary: "summary",
    findings: [{ title: "x", evidence: "x", diagnosis: "x", action: "x", priority: "urgent", confidence: "high", validation: "x" }],
    creative_tests: [],
    next_actions: []
  };
  const validation = validateAnalysis(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /priority/);
});
