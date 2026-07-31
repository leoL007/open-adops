import test from "node:test";
import assert from "node:assert/strict";
import { publicAiRoutes, publicGrokRoutes, resolveAiRoute, resolveGrokRoute } from "../src/ai-router.mjs";

test("AI router uses Terra for lightweight work and Sol for deep work", () => {
  assert.deepEqual(
    {
      model: resolveAiRoute("intakeQuestions", {}).model,
      effort: resolveAiRoute("intakeQuestions", {}).effort
    },
    { model: "gpt-5.6-terra", effort: "low" }
  );
  assert.deepEqual(
    {
      model: resolveAiRoute("intakeStrategy", {}).model,
      effort: resolveAiRoute("intakeStrategy", {}).effort
    },
    { model: "gpt-5.6-terra", effort: "medium" }
  );
  assert.deepEqual(
    {
      model: resolveAiRoute("launchPack", {}).model,
      effort: resolveAiRoute("launchPack", {}).effort
    },
    { model: "gpt-5.6-sol", effort: "high" }
  );
  assert.deepEqual(
    {
      model: resolveAiRoute("optimizeAnalysis", {}).model,
      effort: resolveAiRoute("optimizeAnalysis", {}).effort
    },
    { model: "gpt-5.6-sol", effort: "high" }
  );
});

test("Terra routes expose a Sol medium structure fallback", () => {
  const route = resolveAiRoute("analysis", {});
  assert.equal(route.fallback.model, "gpt-5.6-sol");
  assert.equal(route.fallback.effort, "medium");
  assert.equal(resolveAiRoute("intakeDeep", {}).fallback, null);
  assert.equal(resolveAiRoute("optimizeAnalysis", {}).fallback, null);
});

test("local environment overrides do not require changing global Codex config", () => {
  const route = resolveAiRoute("intakeStrategy", {
    OPENADOPS_TERRA_MODEL: "terra-test",
    OPENADOPS_DEEP_MODEL: "deep-test",
    OPENADOPS_REASONING_EFFORT: "high",
    OPENADOPS_TIMEOUT_MS: "210000"
  });
  assert.equal(route.model, "terra-test");
  assert.equal(route.effort, "high");
  assert.equal(route.timeoutMs, 210000);
  assert.equal(route.fallback.model, "deep-test");
  assert.equal(publicAiRoutes({}).experiments.model, "gpt-5.6-terra");
  assert.equal(publicAiRoutes({}).optimizeAnalysis.model, "gpt-5.6-sol");
});

test("Grok routes default to grok-4.5 high without Codex fallback", () => {
  const analysis = resolveGrokRoute("analysis", {});
  assert.equal(analysis.model, "grok-4.5");
  assert.equal(analysis.effort, "high");
  assert.equal(analysis.fallback, null);
  assert.equal(analysis.provider, "grok");
  assert.equal(resolveGrokRoute("launchPack", {}).effort, "high");
  assert.equal(publicGrokRoutes({}).optimizeAnalysis.model, "grok-4.5");
  assert.equal(
    resolveGrokRoute("analysis", { OPENADOPS_GROK_MODEL: "grok-custom", OPENADOPS_GROK_REASONING_EFFORT: "medium" }).model,
    "grok-custom"
  );
});
