import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const launcher = readFileSync(path.join(root, "OpenAdOps.cmd"), "utf8");

test("Windows launcher finds the full project and requires the user's Codex login", () => {
  assert.match(launcher, /^@echo off/);
  assert.match(launcher, /OPENADOPS_HOME/);
  assert.match(launcher, /%USERPROFILE%\\Documents\\Hypic\\open-adops/);
  assert.match(launcher, /call "%CODEX_COMMAND%" login status/i);
  assert.match(launcher, /call "%CODEX_COMMAND%" login \|\| goto :codex_login_failed/i);
  assert.match(launcher, /api\/health/);
  assert.match(launcher, /call npm start/);
  assert.match(launcher, /Start-Process \$url/);
  assert.doesNotMatch(launcher, /\\Users\\leo|\/Users\/leo/);
});
