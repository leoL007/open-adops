import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectCodexCli } from "../src/codex-cli.mjs";

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
check("Creative requirements schema", existsSync(path.join(root, "schemas", "creative-requirements.schema.json")), "schemas/creative-requirements.schema.json");

const grok = spawnSync(process.env.GROK_BIN || process.env.OPENADOPS_GROK_BIN || "grok", ["--version"], { encoding: "utf8", shell: false });
check(
  "Grok CLI (optional · Grok 4.5 mode)",
  grok.status === 0,
  grok.status === 0
    ? (grok.stdout || grok.stderr).trim()
    : "not found — optional; use 本地演示, or install/login grok on this machine"
);

const codex = detectCodexCli();
check(
  "Codex CLI (optional · GPT-5.6 mode)",
  codex.available,
  codex.available ? `${codex.version} · ${codex.source}` : codex.error
);

console.log("OpenAdOps doctor\n");
for (const item of checks) {
  console.log(`${item.ok ? "✓" : item.label.includes("optional") ? "○" : "✗"} ${item.label}: ${item.detail}`);
}

const requiredFailed = checks.some((item) => !item.ok && !item.label.includes("optional"));
if (requiredFailed) process.exitCode = 1;
