import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenAdOpsApiError,
  isCancelledRequest,
  requestJson,
  runtimeVersionWarning
} from "../public/lib/api-client.js";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    }
  };
}

test("requestJson returns a successful structured payload", async () => {
  const payload = await requestJson("/api/health", {}, {
    fetchImpl: async () => response(200, JSON.stringify({ ok: true, app: "OpenAdOps" }))
  });

  assert.equal(payload.app, "OpenAdOps");
});

test("requestJson preserves server error codes and messages", async () => {
  await assert.rejects(
    requestJson("/api/analyze", {}, {
      fetchImpl: async () => response(499, JSON.stringify({
        ok: false,
        code: "CANCELLED",
        error: "已取消本次生成"
      }))
    }),
    (error) => {
      assert.ok(error instanceof OpenAdOpsApiError);
      assert.equal(error.code, "CANCELLED");
      assert.equal(error.status, 499);
      assert.equal(isCancelledRequest(error), true);
      return true;
    }
  );
});

test("a busy response receives a stable client code", async () => {
  await assert.rejects(
    requestJson("/api/analyze", {}, {
      fetchImpl: async () => response(409, JSON.stringify({
        ok: false,
        error: "已有一个 Codex 分析任务在运行，请等待完成。"
      }))
    }),
    (error) => {
      assert.equal(error.code, "AI_BUSY");
      assert.match(error.message, /已有一个/);
      return true;
    }
  );
});

test("non-JSON server output is translated into an actionable error", async () => {
  await assert.rejects(
    requestJson("/api/analyze", {}, {
      fetchImpl: async () => response(502, "<html>proxy error</html>")
    }),
    (error) => {
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.match(error.message, /无法识别/);
      assert.doesNotMatch(error.message, /Unexpected token/);
      return true;
    }
  );
});

test("network failures point to the local start command", async () => {
  await assert.rejects(
    requestJson("/api/health", {}, {
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      }
    }),
    (error) => {
      assert.equal(error.code, "NETWORK_ERROR");
      assert.match(error.message, /npm start/);
      return true;
    }
  );
});

test("matching page and runtime versions do not warn", () => {
  assert.equal(runtimeVersionWarning("0.5.4", "v0.5.4"), "");
});

test("stale or unidentified runtimes receive a restart warning", () => {
  assert.match(runtimeVersionWarning("0.5.4", "0.5.3"), /版本 v0\.5\.4.*v0\.5\.3 不一致/);
  assert.match(runtimeVersionWarning("0.5.4", ""), /未返回版本信息/);
});
