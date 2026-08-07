import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiProviderError,
  normalizeApiBaseUrl,
  parseApiJson,
  runApiProviderJson,
  testApiProvider as testProvider
} from "../src/api-provider.mjs";

function response(payload, { status = 200, requestId = "req-test" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => ["x-request-id", "request-id"].includes(name) ? requestId : null },
    async json() { return payload; }
  };
}

test("API JSON parser accepts plain and fenced JSON", () => {
  assert.deepEqual(parseApiJson('{"ok":true}'), { ok: true });
  assert.deepEqual(parseApiJson('```json\n{"ok":true}\n```'), { ok: true });
});

test("provider connection test uses the configured models endpoint", async () => {
  let requestUrl = "";
  const result = await testProvider({
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "sk-session-only",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer sk-session-only");
      assert.equal(options.redirect, "error");
      return response({ data: [{ id: "deepseek-chat" }] });
    }
  });
  assert.equal(requestUrl, "https://api.deepseek.com/v1/models");
  assert.equal(result.modelCount, 1);
  assert.equal(result.model, "deepseek-chat");
});

test("official OpenAI auto mode uses Responses and parses output text", async () => {
  const output = await runApiProviderJson({
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "auto",
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

test("OpenAI-compatible mode uses chat completions and the configured model", async () => {
  await runApiProviderJson({
    protocol: "openai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.5",
    apiKey: "xai-session-only",
    routeKey: "creativeRequirements",
    prompt: "Return JSON",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.x.ai/v1/chat/completions");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "grok-4.5");
      assert.equal(body.response_format.type, "json_object");
      return response({ choices: [{ message: { content: '{"result":"ok"}' } }] });
    }
  });
});

test("Anthropic-compatible mode uses Messages headers and parses text blocks", async () => {
  const output = await runApiProviderJson({
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-example",
    apiKey: "anthropic-session-only",
    routeKey: "analysis",
    prompt: "Return JSON",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options.headers["x-api-key"], "anthropic-session-only");
      assert.equal(options.headers["anthropic-version"], "2023-06-01");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "claude-example");
      return response({ content: [{ type: "text", text: '{"result":"ok"}' }] });
    }
  });
  assert.deepEqual(output.result, { result: "ok" });
});

test("website mode rejects local or unsafe Base URLs", () => {
  assert.throws(
    () => normalizeApiBaseUrl("http://127.0.0.1:3456/v1"),
    (error) => error instanceof ApiProviderError && error.code === "BASE_URL_UNSAFE"
  );
  assert.throws(
    () => normalizeApiBaseUrl("https://localhost/v1"),
    (error) => error instanceof ApiProviderError && error.code === "BASE_URL_PRIVATE"
  );
});

test("custom compatibility endpoints cannot pretend to use OpenAI auto routing", async () => {
  await assert.rejects(
    testProvider({
      protocol: "openai",
      baseUrl: "https://api.example.com/v1",
      model: "auto",
      apiKey: "session-only",
      fetchImpl: async () => response({ data: [] })
    }),
    (error) => error instanceof ApiProviderError && error.code === "MODEL_REQUIRED"
  );
});

test("local edition allows a local compatibility gateway", () => {
  assert.equal(
    normalizeApiBaseUrl("http://127.0.0.1:3456/v1/", { allowPrivateHosts: true }),
    "http://127.0.0.1:3456/v1"
  );
});

test("missing API keys fail before network access", async () => {
  await assert.rejects(
    runApiProviderJson({ protocol: "openai", routeKey: "analysis", prompt: "x", fetchImpl: async () => response({}) }),
    (error) => error instanceof ApiProviderError && error.code === "API_KEY_MISSING"
  );
});
