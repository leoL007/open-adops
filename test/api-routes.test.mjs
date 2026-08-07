import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApiProvider, publicApiRoutes, resolveApiRoute } from "../public/lib/api-routes.js";

test("OpenAI API keeps task-aware Terra and Sol routing", () => {
  assert.equal(resolveApiRoute("openai", "creativeRequirements").model, "gpt-5.6-terra");
  assert.equal(resolveApiRoute("openai", "optimizeAnalysis").model, "gpt-5.6-sol");
  assert.equal(resolveApiRoute("openai", "optimizeAnalysis").effort, "high");
});

test("xAI API uses Grok 4.5 high for every task", () => {
  const routes = publicApiRoutes("xai");
  assert.equal(routes.intakeQuestions.model, "grok-4.5");
  assert.equal(routes.launchPack.model, "grok-4.5");
  assert.equal(routes.analysis.effort, "high");
});

test("unknown API providers fall back to OpenAI without accepting a custom host", () => {
  assert.equal(normalizeApiProvider("http://127.0.0.1:9000"), "openai");
});
