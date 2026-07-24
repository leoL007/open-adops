import test from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkspaceState,
  workspaceLoadWarning
} from "../public/lib/workspace-state.js";

function memoryStorage(entries = {}, setError = null) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (setError) throw setError;
      values.set(key, value);
    },
    value(key) {
      return values.get(key);
    }
  };
}

const normalize = (state) => ({ ...state, normalized: true });
const fallback = () => ({ activeProjectId: "demo", projects: [{ id: "demo" }] });

test("a quota failure preserves the readable workspace in memory", () => {
  const quota = new Error("storage quota exceeded");
  quota.name = "QuotaExceededError";
  const storage = memoryStorage({
    current: JSON.stringify({ activeProjectId: "real", projects: [{ id: "real" }] })
  }, quota);

  const result = loadWorkspaceState({
    storage,
    currentKey: "current",
    normalize,
    createFallback: fallback
  });

  assert.equal(result.state.activeProjectId, "real");
  assert.equal(result.state.normalized, true);
  assert.equal(result.persisted, false);
  assert.equal(result.warnings.at(-1).type, "write_quota");
  assert.match(workspaceLoadWarning(result), /现有项目已读取/);
});

test("corrupt current data falls back to a valid previous workspace", () => {
  const storage = memoryStorage({
    current: "{broken",
    previous: JSON.stringify({ activeProjectId: "old", projects: [{ id: "old" }] })
  });

  const result = loadWorkspaceState({
    storage,
    currentKey: "current",
    previousKeys: ["previous"],
    normalize,
    createFallback: fallback
  });

  assert.equal(result.state.activeProjectId, "old");
  assert.equal(result.sourceKey, "previous");
  assert.equal(result.persisted, true);
  assert.equal(JSON.parse(storage.value("current")).normalized, true);
  assert.match(workspaceLoadWarning(result), /旧版本恢复/);
});

test("unreadable generations use the explicit fallback with a warning", () => {
  const result = loadWorkspaceState({
    storage: memoryStorage({
      current: "null",
      previous: JSON.stringify({ projects: [] })
    }),
    currentKey: "current",
    previousKeys: ["previous"],
    normalize,
    createFallback: fallback
  });

  assert.equal(result.sourceKey, null);
  assert.equal(result.state.activeProjectId, "demo");
  assert.match(workspaceLoadWarning(result), /演示项目/);
});

test("missing storage data uses the fallback without a false warning", () => {
  const result = loadWorkspaceState({
    storage: memoryStorage(),
    currentKey: "current",
    previousKeys: ["previous"],
    normalize,
    createFallback: fallback
  });

  assert.equal(result.state.activeProjectId, "demo");
  assert.equal(workspaceLoadWarning(result), "");
});
