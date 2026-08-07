import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
const sharedDir = path.join(serverDir, "shared");
const publicDir = path.join(root, "public");
const excludedPublicFiles = new Set([
  ".!73615!index.html",
  "_write_test.txt",
  "index.logo-update.html",
  "logo.svg"
]);

await rm(dist, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await mkdir(sharedDir, { recursive: true });

await cp(publicDir, path.join(dist, "client"), {
  recursive: true,
  filter(source) {
    const relative = path.relative(publicDir, source);
    return !excludedPublicFiles.has(relative);
  }
});
await cp(path.join(root, "schemas"), path.join(dist, "client", "schemas"), { recursive: true });

const workerSource = (await readFile(path.join(root, "src", "site-worker.mjs"), "utf8"))
  .replace("../public/version.js", "./shared/version.js")
  .replace("../public/lib/api-routes.js", "./shared/api-routes.js");
await writeFile(path.join(serverDir, "index.js"), workerSource);

for (const file of [
  "api-provider.mjs",
  "analysis-validator.mjs",
  "creative-requirements-validator.mjs",
  "intake-validator.mjs",
  "launch-pack-validator.mjs"
]) {
  const source = await readFile(path.join(root, "src", file), "utf8");
  const deployableSource = file === "api-provider.mjs"
    ? source.replace("../public/lib/api-routes.js", "./shared/api-routes.js")
    : source;
  await writeFile(path.join(serverDir, file), deployableSource);
}

await cp(path.join(root, "public", "version.js"), path.join(sharedDir, "version.js"));
await cp(path.join(root, "public", "lib", "api-routes.js"), path.join(sharedDir, "api-routes.js"));

console.log("OpenAdOps site build ready: dist/server/index.js + dist/client");
