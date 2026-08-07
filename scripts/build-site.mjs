import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
const publicModuleDir = path.join(dist, "public", "lib");

await rm(dist, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await mkdir(publicModuleDir, { recursive: true });

await cp(path.join(root, "public"), path.join(dist, "client"), { recursive: true });
await cp(path.join(root, "schemas"), path.join(dist, "client", "schemas"), { recursive: true });
await cp(path.join(root, "src", "site-worker.mjs"), path.join(serverDir, "index.js"));

for (const file of [
  "api-provider.mjs",
  "analysis-validator.mjs",
  "creative-requirements-validator.mjs",
  "intake-validator.mjs",
  "launch-pack-validator.mjs"
]) {
  await cp(path.join(root, "src", file), path.join(serverDir, file));
}

await cp(path.join(root, "public", "version.js"), path.join(dist, "public", "version.js"));
await cp(path.join(root, "public", "lib", "api-routes.js"), path.join(publicModuleDir, "api-routes.js"));

console.log("OpenAdOps site build ready: dist/server/index.js + dist/client");
