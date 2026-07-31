import test from "node:test";
import assert from "node:assert/strict";
import { parseGrokCliOutput } from "../src/grok-cli-output.mjs";

test("parseGrokCliOutput prefers structuredOutput from headless envelope", () => {
  const raw = JSON.stringify({
    text: "{\"ok\":true}",
    structuredOutput: { ok: true, msg: "hello" },
    stopReason: "EndTurn"
  });
  assert.deepEqual(parseGrokCliOutput(raw), { ok: true, msg: "hello" });
});

test("parseGrokCliOutput falls back to text JSON and raw objects", () => {
  assert.deepEqual(parseGrokCliOutput(JSON.stringify({ text: "{\"a\":1}" })), { a: 1 });
  assert.deepEqual(parseGrokCliOutput("{\"direct\":true}"), { direct: true });
});
