import test from "node:test";
import assert from "node:assert/strict";
import {
  apiProtocolLabel,
  normalizeApiPreferences,
  normalizeApiProtocol,
  publicApiRoutes,
  resolveApiRoute
} from "../public/lib/api-routes.js";

test("official OpenAI auto mode keeps task-aware Terra and Sol routing", () => {
  const preferences = { protocol: "openai", baseUrl: "https://api.openai.com/v1", model: "auto" };
  assert.equal(resolveApiRoute(preferences, "creativeRequirements").model, "gpt-5.6-terra");
  assert.equal(resolveApiRoute(preferences, "optimizeAnalysis").model, "gpt-5.6-sol");
  assert.equal(resolveApiRoute(preferences, "optimizeAnalysis").effort, "high");
});

test("OpenAI-compatible endpoints use the configured model for every task", () => {
  const routes = publicApiRoutes({ protocol: "openai", baseUrl: "https://api.x.ai/v1", model: "grok-4.5" });
  assert.equal(routes.intakeQuestions.model, "grok-4.5");
  assert.equal(routes.launchPack.model, "grok-4.5");
  assert.equal(routes.analysis.protocol, "openai");
});

test("Anthropic-compatible endpoints use one explicit model", () => {
  const routes = publicApiRoutes({
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-example"
  });
  assert.equal(routes.analysis.model, "claude-example");
  assert.equal(routes.optimizeAnalysis.model, "claude-example");
  assert.equal(apiProtocolLabel("anthropic"), "Anthropic 兼容");
});

test("v0.7.0 xAI preferences migrate into OpenAI-compatible configuration", () => {
  assert.deepEqual(normalizeApiPreferences({ provider: "xai" }), {
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.5"
  });
  assert.equal(normalizeApiProtocol("unknown"), "openai");
});
