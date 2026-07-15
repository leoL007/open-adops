import test from "node:test";
import assert from "node:assert/strict";
import { validateAnalysis } from "../src/analysis-validator.mjs";
import { buildMockAnalysis } from "../src/mock-analysis.mjs";

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
