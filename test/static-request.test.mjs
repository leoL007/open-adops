import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  resolveStaticFile,
  shouldSendStaticBody
} from "../src/static-request.mjs";

const publicRoot = path.resolve("/workspace/public");

test("root requests resolve to the public index", () => {
  const result = resolveStaticFile("/", publicRoot);
  assert.equal(result.ok, true);
  assert.equal(result.filePath, path.join(publicRoot, "index.html"));
});

test("malformed and null-byte paths receive a client error", () => {
  assert.deepEqual(
    resolveStaticFile("/%E0%A4%A", publicRoot),
    { ok: false, status: 400, error: "请求路径编码无效" }
  );
  assert.deepEqual(
    resolveStaticFile("/file%00.js", publicRoot),
    { ok: false, status: 400, error: "请求路径包含无效字符" }
  );
});

test("decoded traversal cannot leave the public directory", () => {
  const result = resolveStaticFile("/%2e%2e/server.mjs", publicRoot);
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("HEAD requests return headers without a response body", () => {
  assert.equal(shouldSendStaticBody("GET"), true);
  assert.equal(shouldSendStaticBody("HEAD"), false);
});
