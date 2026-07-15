import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockAnalysis } from "./src/mock-analysis.mjs";
import { validateAnalysis } from "./src/analysis-validator.mjs";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(APP_ROOT, "public");
const SCHEMA_PATH = path.join(APP_ROOT, "schemas", "analysis.schema.json");
const PORT = Number(process.env.PORT || 4173);
const MODEL = process.env.ADPILOT_MODEL || "gpt-5.6-sol";
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
let activeAiJob = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("请求体过大"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求 JSON 无法解析"));
      }
    });
    request.on("error", reject);
  });
}

function buildAnalysisPrompt({ project, metrics, stage }) {
  const safeInput = {
    project: {
      name: project?.name,
      industry: project?.industry,
      platforms: project?.platforms,
      markets: project?.markets,
      budget: project?.budget,
      currency: project?.currency,
      goal: project?.goal,
      targetCpi: project?.targetCpi,
      targetCpa: project?.targetCpa,
      targetRoas: project?.targetRoas,
      attribution: project?.attribution,
      sellingPoints: project?.sellingPoints,
      notes: project?.notes,
      strategy: project?.strategy
    },
    metrics,
    stage
  };

  return `你是海外 App 投放策略与优化助手。请使用当前环境已安装的 Ads / 对应媒体 Ads skill 作为分析方法，但只做只读分析，不修改文件，不登录或操作广告账户。

任务：根据项目设定与已计算的媒体/AppsFlyer指标，输出可执行的中文投放判断。覆盖策略、素材测试、广告调整和下一步动作。证据不足时必须降低 confidence，并在 validation 中说明如何验证；禁止编造输入中不存在的数据。

判断规则：
1. 明确区分证据、诊断、动作。
2. 优先处理高花费、高于目标成本、归因差异和留存质量问题。
3. 素材测试必须遵守单变量原则，并按媒体给出平台原生 Hook。
4. 所有动作必须给出负责人、时点和成功指标。
5. 最终只输出符合给定 JSON Schema 的 JSON 对象，不要 Markdown。

输入：
${JSON.stringify(safeInput, null, 2)}`;
}

function parseModelOutput(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(unfenced);
  }
}

function runCodexAnalysis(payload) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `adpilot-analysis-${randomUUID()}.json`);
    const args = [
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--model",
      MODEL,
      "--output-schema",
      SCHEMA_PATH,
      "--output-last-message",
      outputPath,
      "-"
    ];
    const child = spawn(CODEX_BIN, args, {
      cwd: APP_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = async () => {
      if (existsSync(outputPath)) await unlink(outputPath).catch(() => {});
    };
    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await cleanup();
      if (error) reject(error);
      else resolve(result);
    };

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-20000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-20000);
    });
    child.on("error", (error) => finish(new Error(`无法启动 Codex CLI：${error.message}`)));
    child.on("close", async (code) => {
      if (code !== 0) {
        finish(new Error(`Codex 分析失败（退出码 ${code}）：${stderr.trim() || stdout.trim() || "无错误详情"}`));
        return;
      }
      try {
        const raw = await readFile(outputPath, "utf8");
        const result = parseModelOutput(raw);
        const validation = validateAnalysis(result);
        if (!validation.valid) throw new Error(`结构校验失败：${validation.errors.join("；")}`);
        finish(null, result);
      } catch (error) {
        finish(new Error(`无法读取结构化分析结果：${error.message}`));
      }
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Codex 分析超过 4 分钟，已停止。本次没有写入结果。"));
    }, 4 * 60 * 1000);

    child.stdin.end(buildAnalysisPrompt(payload));
  });
}

async function handleAnalyze(request, response) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
    return;
  }

  if (!payload.project || typeof payload.project !== "object") {
    sendJson(response, 400, { ok: false, error: "缺少项目配置" });
    return;
  }

  if (payload.mode === "mock") {
    const result = buildMockAnalysis(payload.project, payload.metrics);
    const validation = validateAnalysis(result);
    sendJson(response, validation.valid ? 200 : 500, {
      ok: validation.valid,
      source: "mock",
      model: "deterministic-mock",
      result,
      error: validation.valid ? undefined : validation.errors.join("；")
    });
    return;
  }

  if (activeAiJob) {
    sendJson(response, 409, { ok: false, error: "已有一个 Codex 分析任务在运行，请等待完成。" });
    return;
  }

  activeAiJob = true;
  try {
    const result = await runCodexAnalysis(payload);
    sendJson(response, 200, { ok: true, source: "codex", model: MODEL, result });
  } catch (error) {
    sendJson(response, 502, { ok: false, error: error.message });
  } finally {
    activeAiJob = false;
  }
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_ROOT, `.${requested}`);
  if (!filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    sendJson(response, 403, { ok: false, error: "禁止访问" });
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": path.extname(filePath) === ".html" ? "no-store" : "public, max-age=300"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { ok: false, error: "页面不存在" });
    } else {
      sendJson(response, 500, { ok: false, error: "读取页面失败" });
    }
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, app: "AdPilot MVP", model: MODEL, aiBusy: activeAiJob });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/analyze") {
    await handleAnalyze(request, response);
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    await serveStatic(url.pathname, response);
    return;
  }
  sendJson(response, 405, { ok: false, error: "不支持的请求方法" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AdPilot MVP: http://127.0.0.1:${PORT}`);
  console.log(`AI model: ${MODEL} | mode: Codex CLI bridge + Mock`);
});

export { buildAnalysisPrompt, server };
