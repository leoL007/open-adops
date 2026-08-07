import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/site-worker.mjs";

const env = {
  ASSETS: {
    async fetch() {
      return new Response("<!doctype html><title>OpenAdOps</title>", {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
  }
};

test("cloud worker exposes API runtime health and disables local CLI providers", async () => {
  const response = await worker.fetch(new Request("https://openadops.example/api/health"), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.runtime, "cloud");
  assert.equal(payload.providers.api.available, true);
  assert.equal(payload.providers.codex.available, false);
  assert.equal(payload.providers.grok.available, false);
  assert.equal(payload.apiRoutes.optimizeAnalysis.model, "gpt-5.6-sol");
});

test("cloud worker rejects API connection tests without a key", async () => {
  const response = await worker.fetch(new Request("https://openadops.example/api/provider/test", {
    method: "POST",
    headers: { "x-openadops-provider": "openai" }
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.code, "API_KEY_MISSING");
});

test("cloud worker rejects localhost compatibility endpoints before forwarding a key", async () => {
  const response = await worker.fetch(new Request("https://openadops.example/api/provider/test", {
    method: "POST",
    headers: {
      "x-openadops-protocol": "openai",
      "x-openadops-base-url": "http://127.0.0.1:3456/v1",
      "x-openadops-model": "local-model",
      "x-openadops-api-key": "session-only"
    }
  }), env);
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.code, "BASE_URL_UNSAFE");
});

test("cloud worker adds security headers to static assets", async () => {
  const response = await worker.fetch(new Request("https://openadops.example/"), env);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /OpenAdOps/);
});
