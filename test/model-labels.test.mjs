import test from "node:test";
import assert from "node:assert/strict";
import { modelFullName, modelRouteDetail, modelVariantName } from "../public/lib/model-labels.js";

test("model labels distinguish Terra and Sol without repeating the family name", () => {
  assert.equal(modelVariantName("gpt-5.6-terra"), "Terra");
  assert.equal(modelVariantName("gpt-5.6-sol"), "Sol");
  assert.equal(modelFullName("gpt-5.6-terra"), "GPT-5.6 Terra");
  assert.equal(modelFullName("gpt-5.6-sol"), "GPT-5.6 Sol");
});

test("model labels map the legacy deep model id to Sol and preserve custom ids", () => {
  assert.equal(modelVariantName("gpt-5.6"), "Sol");
  assert.equal(modelFullName("gpt-5.6"), "GPT-5.6 Sol");
  assert.equal(modelFullName("custom-deep-model"), "custom-deep-model");
  assert.equal(modelFullName("codex-default"), "本机模型");
});

test("single-task operation bars share one routing label template", () => {
  assert.equal(modelRouteDetail("gpt-5.6-terra", "中"), "智能路由 · 模型：Terra · 推理：中");
  assert.equal(modelRouteDetail("gpt-5.6-sol", "高"), "智能路由 · 模型：Sol · 推理：高");
  assert.equal(modelRouteDetail("gpt-5.6", "高"), "智能路由 · 模型：Sol · 推理：高");
});
