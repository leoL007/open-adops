import { readFile } from "node:fs/promises";
import process from "node:process";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const versionSource = await readFile(new URL("../public/version.js", import.meta.url), "utf8");
const match = versionSource.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
const appVersion = match?.[1] || "";
const tag = process.argv.find((argument) => argument.startsWith("--tag="))?.slice(6) || process.env.OPENADOPS_RELEASE_TAG || "";
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) errors.push(`package.json 版本不合法：${packageJson.version}`);
if (appVersion !== packageJson.version) errors.push(`public/version.js (${appVersion || "缺失"}) 与 package.json (${packageJson.version}) 不一致`);
if (tag && tag !== `v${packageJson.version}`) errors.push(`Tag ${tag} 与 package.json v${packageJson.version} 不一致`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`OpenAdOps version OK: v${packageJson.version}`);
