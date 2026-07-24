import test from "node:test";
import assert from "node:assert/strict";
import { parseRequestUrl } from "../src/request-url.mjs";

test("relative request targets resolve against a fixed local base", () => {
  const result = parseRequestUrl("/api/health?detail=1");
  assert.equal(result.ok, true);
  assert.equal(result.url.pathname, "/api/health");
  assert.equal(result.url.searchParams.get("detail"), "1");
  assert.equal(result.url.host, "127.0.0.1");
});

test("request URL parsing does not depend on an untrusted Host header", () => {
  const result = parseRequestUrl("/");
  assert.equal(result.ok, true);
  assert.equal(result.url.href, "http://127.0.0.1/");
});

test("invalid request targets receive a client error", () => {
  assert.deepEqual(
    parseRequestUrl("http://["),
    { ok: false, status: 400, error: "请求地址无效" }
  );
});
