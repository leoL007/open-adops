import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("site build is self-contained and excludes local scratch files", async () => {
  await execFileAsync(process.execPath, [path.join(root, "scripts", "build-site.mjs")], { cwd: root });

  const workerPath = path.join(root, "dist", "server", "index.js");
  const workerSource = await readFile(workerPath, "utf8");
  assert.doesNotMatch(workerSource, /\.\.\/public\//);

  const worker = await import(`${pathToFileURL(workerPath).href}?test=${Date.now()}`);
  assert.equal(typeof worker.default.fetch, "function");

  await assert.rejects(access(path.join(root, "dist", "client", "_write_test.txt")));
  await assert.rejects(access(path.join(root, "dist", "client", "index.logo-update.html")));
  await assert.rejects(access(path.join(root, "dist", "client", "logo.svg")));
});
