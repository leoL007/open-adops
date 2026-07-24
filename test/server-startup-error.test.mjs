import test from "node:test";
import assert from "node:assert/strict";
import { formatServerStartupError } from "../src/server-startup-error.mjs";

test("occupied ports receive a concise restart instruction", () => {
  const message = formatServerStartupError({ code: "EADDRINUSE" }, { port: 4173 });
  assert.match(message, /端口 4173 已被占用/);
  assert.match(message, /停止旧进程/);
});

test("permission failures point to terminal permissions", () => {
  const message = formatServerStartupError({ code: "EPERM" }, { port: 4173 });
  assert.match(message, /没有本地监听权限/);
  assert.match(message, /macOS 终端权限/);
});

test("unknown startup failures preserve the useful detail", () => {
  const message = formatServerStartupError(new Error("socket failed"));
  assert.equal(message, "OpenAdOps 启动失败：socket failed");
});
