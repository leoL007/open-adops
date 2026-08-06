import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const launcherPath = path.join(root, "打开 OpenAdOps.command");
const launcher = readFileSync(launcherPath, "utf8");

test("macOS launcher is portable, executable and reuses a healthy server", () => {
  assert.match(launcher, /^#!\/bin\/zsh/);
  assert.match(launcher, /SCRIPT_DIR="\$\{0:A:h\}"/);
  assert.match(launcher, /OPENADOPS_HOME/);
  assert.match(launcher, /\$HOME\/Documents\/Hypic\/open-adops/);
  assert.match(launcher, /api\/health/);
  assert.match(launcher, /"app":"OpenAdOps"/);
  assert.match(launcher, /npm start/);
  assert.doesNotMatch(launcher, /\/Users\/leo/);
  assert.notEqual(statSync(launcherPath).mode & 0o111, 0);
});
