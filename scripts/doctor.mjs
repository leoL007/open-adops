import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const checks = [];

function check(label, ok, detail) {
  checks.push({ label, ok, detail });
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
check("Node.js 20+", nodeMajor >= 20, process.version);
check("Web workspace", existsSync(path.join(root, "public", "index.html")), "public/index.html");
check("Analysis schema", existsSync(path.join(root, "schemas", "analysis.schema.json")), "schemas/analysis.schema.json");
check("Intake schema", existsSync(path.join(root, "schemas", "intake.schema.json")), "schemas/intake.schema.json");
check("Launch Pack schema", existsSync(path.join(root, "schemas", "launch-pack.schema.json")), "schemas/launch-pack.schema.json");
check("Experiment schema", existsSync(path.join(root, "schemas", "experiment-plan.schema.json")), "schemas/experiment-plan.schema.json");

const codex = spawnSync(process.env.CODEX_BIN || "codex", ["--version"], { encoding: "utf8", shell: false });
check("Codex CLI (optional)", codex.status === 0, codex.status === 0 ? codex.stdout.trim() : "not found — Mock mode still works");

console.log("OpenAdOps doctor\n");
for (const item of checks) {
  console.log(`${item.ok ? "✓" : item.label.includes("optional") ? "○" : "✗"} ${item.label}: ${item.detail}`);
}

const requiredFailed = checks.some((item) => !item.ok && !item.label.includes("optional"));
if (requiredFailed) process.exitCode = 1;
