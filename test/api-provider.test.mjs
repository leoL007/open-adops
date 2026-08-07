import test from "node:test";
import assert from "node:assert/strict";
import { ApiProviderError, parseApiJson, runApiProviderJson, testApiProvider as testProvider } from "../src/api-provider.mjs";

function response(payload, { status = 200, requestId = "req-test" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "x-request-id" ? requestId : null },
    async json() { return payload; }
  };
}

test("API JSON parser accepts plain and fenced JSON", () => {
  assert.deepEqual(parseApiJson('{"ok":true}'), { ok: true });
  assert.deepEqual(parseApiJson('```json\n{"ok":true}\n```'), { ok: true });
});

test("provider connection test does not make a generation request", async () => {
  let requestUrl = "";
  const result = await testProvider({
    provider: "openai",
    apiKey: "sk-session-only",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sk-session-only");
      return response({ data: [{ id: "gpt-5.6-terra" }] });
    }
  });
  assert.match(requestUrl, /\/models$/);
  assert.equal(result.modelCount, 1);
});

test("OpenAI API uses Responses and parses output_text content", async () => {
  const output = await runApiProviderJson({
    provider: "openai",
    apiKey: "sk-session-only",
    routeKey: "analysis",
    prompt: "Return JSON",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-5.6-terra");
      assert.equal(body.reasoning.effort, "medium");
      assert.equal(body.store, false);
      return response({ output: [{ content: [{ type: "output_text", text: '{"result":"ok"}' }] }] });
    }
  });
  assert.deepEqual(output.result, { result: "ok" });
  assert.equal(output.requestId, "req-test");
});

test("xAI API uses the fixed official endpoint instead of a user supplied host", async () => {
  await runApiProviderJson({
    provider: "xai",
    apiKey: "xai-session-only",
    routeKey: "creativeRequirements",
    prompt: "Return JSON",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.x.ai/v1/chat/completions");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "grok-4.5");
      return response({ choices: [{ message: { content: '{"result":"ok"}' } }] });
    }
  });
});

test("missing API keys fail before network access", async () => {
  await assert.rejects(
    runApiProviderJson({ provider: "openai", routeKey: "analysis", prompt: "x", fetchImpl: async () => response({}) }),
    (error) => error instanceof ApiProviderError && error.code === "API_KEY_MISSING"
  );
});
