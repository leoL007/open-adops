import test from "node:test";
import assert from "node:assert/strict";
import { buildMockIntake } from "../public/lib/mock-intake.js";
import { validateIntake } from "../src/intake-validator.mjs";

test("deterministic intake mock produces a complete validated brief", () => {
  const project = {
    name: "Finance App SEA",
    industry: "金融",
    platforms: ["Google Ads", "Meta Ads"],
    markets: "ID",
    budget: 10000,
    currency: "USD",
    goal: "Registration",
    targetCpa: 12,
    attribution: "AppsFlyer",
    strategy: { audience: "有跨境支付需求的移动端用户" }
  };
  const result = buildMockIntake(project, {
    rawOffer: "印尼金融 App，目标注册，媒体 Google 和 Meta，客户会提供视频素材。",
    clientStrategy: "先测试 Jakarta，策略仅供参考。",
    operatorNotes: "需要确认牌照和免责声明。",
    strategyAuthority: "reference"
  });
  assert.deepEqual(validateIntake(result), { valid: true, errors: [] });
  assert.equal(result.brief_fields.length, 14);
  assert.equal(result.strategy_draft.platform_plan.length, 2);
  assert.ok(result.clarification_questions.every((item) => item.field_key));
});

test("intake validator rejects duplicate or incomplete brief keys", () => {
  const result = buildMockIntake({ name: "Demo", industry: "工具", platforms: ["Google Ads"], goal: "Install" }, { rawOffer: "工具 App" });
  result.brief_fields[1].key = result.brief_fields[0].key;
  const validation = validateIntake(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /重复|缺少/);
});

test("an observation metric is confirmed without inventing a KPI threshold", () => {
  const result = buildMockIntake({
    name: "Learning App",
    platforms: ["Google Ads"],
    goal: "Install",
    performanceTargets: [{ id: "t1", metric: "af_cpi", status: "observe", value: 0, primary: true }]
  }, { rawOffer: "先使用自动出价跑一段时间，建立安装成本基线。" });
  const kpi = result.brief_fields.find((field) => field.key === "kpi");
  assert.equal(kpi.status, "confirmed");
  assert.equal(kpi.value, "AF-CPI 仅观察，暂无阈值");
  assert.doesNotMatch(kpi.value, /\b0\b/);
});
