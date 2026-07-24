import {
  FIELD_LABELS,
  calculateMetrics,
  calculatePeriodComparison,
  defaultComparisonRanges,
  detectMapping,
  formatMetric,
  mapRows,
  parseCsv
} from "./lib/analytics.js";
import {
  enrichExperimentPlan,
  experimentConclusionComplete,
  experimentPlanSummary,
  experimentSizingInputError
} from "./lib/experiments.js";
import { isCancelledRequest, requestJson, runtimeVersionWarning } from "./lib/api-client.js";
import { buildMockAnalysis } from "./lib/mock-analysis.js";
import { buildMockExperimentPlan } from "./lib/mock-experiment-plan.js";
import { buildMockIntake, INTAKE_BRIEF_FIELDS } from "./lib/mock-intake.js";
import { buildMockLaunchPack } from "./lib/mock-launch-pack.js";
import {
  CREATIVE_TASK_STATUSES,
  creativeProductionCsv,
  creativeProductionMarkdown,
  creativeProductionSummary,
  legacyCreativePlan,
  normalizeCreativeProduction,
  normalizeCreativeTask,
  replaceGeneratedCreativeTasks,
  tasksFromCreativeBriefs,
  tasksFromCreativeTests
} from "./lib/creative-production.js";
import { modelFullName, modelRouteDetail, modelVariantName } from "./lib/model-labels.js";
import {
  OPTIMIZATION_RUN_STATUSES,
  appendOptimizationRun,
  buildOptimizationRun,
  normalizeOptimizationHistory,
  updateOptimizationRun
} from "./lib/optimization-history.js";
import {
  applyMappingProfile,
  mappingProfileCompatibility,
  mergeMappingProfiles,
  normalizeMappingProfiles,
  removeMappingProfile,
  suggestMappingProfile,
  upsertMappingProfile
} from "./lib/mapping-profiles.js";
import {
  PERFORMANCE_TARGET_METRICS,
  PERFORMANCE_TARGET_STATUSES,
  normalizePerformanceTargets,
  targetHint
} from "./lib/project-targets.js";
import {
  backupFileName,
  buildProjectBackup,
  buildWorkspaceBackup,
  mergeProjects,
  parseBackupJson
} from "./lib/workspace-backup.js";
import { isStorageQuotaError, loadWorkspaceState, workspaceLoadWarning } from "./lib/workspace-state.js";
import { APP_VERSION } from "./version.js";

const STORAGE_KEY = "openadops:v4";
const PREVIOUS_STORAGE_KEYS = ["openadops:v3", "openadops:v2", "openadops:v1"];
const LEGACY_STORAGE_KEY = "adpilot:mvp:v1";
const ROUTES = new Set(["overview", "intake", "strategy", "creative", "launch", "experiments", "optimize", "report"]);
const app = document.querySelector("#app");
const projectSelect = document.querySelector("#projectSelect");
const aiModeSelect = document.querySelector("#aiMode");
const newProjectButton = document.querySelector("#newProjectButton");
const exportWorkspaceButton = document.querySelector("#exportWorkspaceButton");
const exportProjectButton = document.querySelector("#exportProjectButton");
const importWorkspaceButton = document.querySelector("#importWorkspaceButton");
const importWorkspaceFile = document.querySelector("#importWorkspaceFile");
const demoBadge = document.querySelector("#demoBadge");
const versionBadge = document.querySelector("#appVersion");
const projectDialog = document.querySelector("#projectDialog");
const projectForm = document.querySelector("#projectForm");
const toast = document.querySelector("#toast");
const aiJobPanel = document.querySelector("#aiJobPanel");
const aiJobLabel = document.querySelector("#aiJobLabel");
const aiJobMeta = document.querySelector("#aiJobMeta");
const aiJobElapsed = document.querySelector("#aiJobElapsed");
const aiJobExpected = document.querySelector("#aiJobExpected");
const aiCancelButton = document.querySelector("#aiCancelButton");
const aiErrorPanel = document.querySelector("#aiErrorPanel");
const aiErrorMessage = document.querySelector("#aiErrorMessage");
const aiErrorDismiss = document.querySelector("#aiErrorDismiss");
let importSession = null;
let aiBusy = false;
let currentAiJob = null;
let aiJobTimer = null;
let aiJobTicks = 0;
let aiRoutes = {
  intakeQuestions: { label: "生成客户追问", model: "gpt-5.6-terra", effort: "low", expectedSeconds: [30, 90] },
  intakeStrategy: { label: "快速生成策略初稿", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] },
  intakeDeep: { label: "深度复核策略初稿", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] },
  analysis: { label: "投放数据诊断", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] },
  optimizeAnalysis: { label: "投放优化诊断", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] },
  launchPack: { label: "生成投放执行方案", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] },
  experiments: { label: "生成实验账本", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] }
};

const BRIEF_FIELD_META = Object.fromEntries(INTAKE_BRIEF_FIELDS.map(([key, label]) => [key, { label, multiline: ["audience", "creative_supply", "compliance", "constraints"].includes(key) }]));

const DEMO_CSV = `Date,Platform,Country,Campaign,Ad Group,Creative,Spend,Impressions,Clicks,Media Installs,AF Installs,Conversions,Revenue,D1 Retained
2026-07-01,Google Ads,JP,UAC_JP_Core,Core,BeforeAfter_01,820,118000,2760,560,512,82,910,152
2026-07-02,Google Ads,JP,UAC_JP_Core,Core,FeatureDemo_02,910,126000,2920,604,548,91,1020,169
2026-07-01,Google Ads,US,UAC_US_Core,Core,FeatureDemo_02,1260,142000,3180,520,468,68,860,126
2026-07-02,Google Ads,US,UAC_US_Core,Core,UGC_03,1350,149000,3340,536,480,71,905,130
2026-07-01,Meta Ads,JP,ASC_JP_Install,Broad,UGC_03,720,94000,2480,498,452,77,890,145
2026-07-02,Meta Ads,JP,ASC_JP_Install,Broad,BeforeAfter_01,760,99000,2610,522,471,80,940,151
2026-07-01,Meta Ads,GB,ASC_GB_Install,Broad,PainPoint_04,680,89000,2290,458,410,63,755,118
2026-07-02,Meta Ads,GB,ASC_GB_Install,Broad,PainPoint_04,710,92000,2360,466,418,65,790,122
2026-07-01,TikTok Ads,US,Smart_US_Install,Broad,FastHook_05,990,176000,3840,540,452,54,650,104
2026-07-02,TikTok Ads,US,Smart_US_Install,Broad,FastHook_06,1040,184000,4010,556,460,57,680,108
2026-07-01,TikTok Ads,GB,Smart_GB_Install,Broad,Trend_07,740,138000,3180,492,421,52,610,99
2026-07-02,TikTok Ads,GB,Smart_GB_Install,Broad,Trend_08,790,145000,3290,501,425,51,620,96`;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `project-${Date.now()}`;
}

function demoMetrics() {
  const parsed = parseCsv(DEMO_CSV);
  const mapping = detectMapping(parsed.headers);
  return calculateMetrics(mapRows(parsed.rows, mapping));
}

function demoAvailableFields() {
  const parsed = parseCsv(DEMO_CSV);
  const mapping = detectMapping(parsed.headers);
  return Object.keys(mapping).filter((field) => mapping[field]);
}

function demoComparison() {
  const parsed = parseCsv(DEMO_CSV);
  const mapping = detectMapping(parsed.headers);
  const rows = mapRows(parsed.rows, mapping);
  return calculatePeriodComparison(rows, defaultComparisonRanges(rows), {
    availableFields: Object.keys(mapping).filter((field) => mapping[field])
  });
}

function createIntake(overrides = {}) {
  return {
    rawOffer: "",
    clientStrategy: "",
    operatorNotes: "",
    strategyAuthority: "reference",
    analysis: null,
    versions: [],
    ...overrides,
    versions: Array.isArray(overrides.versions) ? overrides.versions : []
  };
}

function createLaunch(overrides = {}) {
  return {
    checklist: overrides.checklist && typeof overrides.checklist === "object" ? overrides.checklist : {},
    pack: overrides.pack || null,
    versions: Array.isArray(overrides.versions) ? overrides.versions : []
  };
}

function createExperiments(overrides = {}) {
  return {
    plan: overrides.plan || null,
    versions: Array.isArray(overrides.versions) ? overrides.versions : []
  };
}

function projectOptimizationHistory(project) {
  const history = normalizeOptimizationHistory(project.optimizationHistory);
  if (history.length || !project.ai?.optimize?.result) return history;
  return [buildOptimizationRun(project.ai.optimize, project.data || {}, {
    id: `legacy-${project.ai.optimize.generatedAt || project.id || "optimize"}`
  })];
}

function syncCreativeProduction(project, tasks = null) {
  const now = new Date().toISOString();
  const normalized = tasks
    ? tasks.map((task) => normalizeCreativeTask(task, {
        makeId,
        now,
        defaultPlatform: project.platforms?.[0],
        defaultMarket: project.markets
      }))
    : normalizeCreativeProduction(project, { makeId, now }).tasks;
  project.creativeProduction = { tasks: normalized, updatedAt: now };
  project.creativePlan = legacyCreativePlan(normalized);
  return project.creativeProduction;
}

function creativeTasks(project) {
  return project.creativeProduction?.tasks || normalizeCreativeProduction(project, { makeId }).tasks;
}

function createDemoProject() {
  const project = {
    id: makeId(),
    name: "Nova Utility · 全球增长示例",
    industry: "工具",
    platforms: ["Google Ads", "Meta Ads", "TikTok Ads"],
    markets: "JP, US, GB",
    budget: 50000,
    currency: "USD",
    goal: "Install",
    performanceTargets: [
      { id: "demo-af-cpi", metric: "af_cpi", status: "test", value: 2.2, event: "", window: "", primary: true }
    ],
    targetReview: "运行满 7 天或积累足够 AF 安装后复盘阈值",
    attribution: "AppsFlyer",
    stage: "测试期",
    sellingPoints: "3 秒完成图片清理；操作简单；输出质量稳定；适合高频日常编辑场景。",
    notes: "所有数值均为工作台演示数据，不代表任何真实产品或客户表现。",
    isDemo: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      objective: "用可控成本建立三媒体安装基线，同时验证留存质量。",
      audience: "18–34 岁、日常使用社交与内容工具的移动端用户。",
      budgetLogic: "70% 稳定获量、20% 素材放量、10% 新市场探索。",
      testLogic: "先固定国家与出价，仅测试 Hook；3 天达到判定门槛后再调整预算。",
      budgetShares: { "Google Ads": 40, "Meta Ads": 35, "TikTok Ads": 25 }
    },
    creativePlan: [
      { angle: "结果前置", hook: "首帧直接展示处理前后差异", platform: "Google Ads", variable: "前 3 秒", metric: "AF-CPI" },
      { angle: "痛点反转", hook: "图片有路人？一键清理", platform: "Meta Ads", variable: "开场文案", metric: "CTR" },
      { angle: "原生演示", hook: "录屏演示 3 步完成编辑", platform: "TikTok Ads", variable: "演示节奏", metric: "CVR" }
    ],
    launch: createLaunch(),
    experiments: createExperiments(),
    data: {
      fileName: "openadops-demo.csv",
      importedAt: new Date().toISOString(),
      metrics: demoMetrics(),
      comparison: demoComparison(),
      availableFields: demoAvailableFields(),
      isDemo: true
    },
    intake: createIntake({
      rawOffer: "产品：Nova Utility 图片处理 App。市场 JP、US、GB；目标 Install；计划投放 Google Ads、Meta Ads、TikTok Ads。客户希望先快速测试，但预算与正式上线时间暂未确认。归因使用 AppsFlyer。",
      clientStrategy: "先以 Google 建立稳定安装基线；Meta 和 TikTok 用短视频素材探索增量。该策略仅供代理商参考，可根据预算和素材情况调整。",
      operatorNotes: "AF-CPI 测试阈值 2.2 USD。客户当前每周可提供 3 条录屏素材，需要确认 D1/D7 留存目标和各市场优先级。",
      strategyAuthority: "reference"
    }),
    optimizationHistory: [],
    ai: {}
  };
  project.intake.analysis = {
    source: "mock",
    model: "browser-local-mock",
    intent: "strategy",
    generatedAt: new Date().toISOString(),
    result: buildMockIntake(project, project.intake, "strategy")
  };
  project.launch.pack = {
    source: "mock",
    model: "browser-local-mock",
    generatedAt: new Date().toISOString(),
    result: buildMockLaunchPack(project, project.intake.analysis.result)
  };
  project.experiments.plan = {
    source: "mock",
    model: "browser-local-mock",
    generatedAt: new Date().toISOString(),
    result: buildMockExperimentPlan(project, project.launch.pack.result)
  };
  syncCreativeProduction(project);
  return project;
}

function initialState() {
  const demo = createDemoProject();
  return { activeProjectId: demo.id, aiMode: "mock", mappingProfiles: [], projects: [demo] };
}

function normalizeStoredState(stored) {
  const projects = stored.projects.map((project) => {
    const normalizedProject = {
      ...project,
      performanceTargets: normalizePerformanceTargets(project),
      targetReview: String(project.targetReview || ""),
      intake: createIntake(project.intake || {}),
      launch: createLaunch(project.launch || {}),
      experiments: createExperiments(project.experiments || {}),
      optimizationHistory: projectOptimizationHistory(project)
    };
    syncCreativeProduction(normalizedProject);
    return normalizedProject;
  });
  return {
    ...stored,
    activeProjectId: projects.some((project) => project.id === stored.activeProjectId)
      ? stored.activeProjectId
      : projects[0].id,
    aiMode: stored.aiMode || "mock",
    mappingProfiles: normalizeMappingProfiles(stored.mappingProfiles),
    projects
  };
}

const stateLoadResult = loadWorkspaceState({
  storage: localStorage,
  currentKey: STORAGE_KEY,
  previousKeys: [...PREVIOUS_STORAGE_KEYS, LEGACY_STORAGE_KEY],
  normalize: normalizeStoredState,
  createFallback: initialState
});
let state = stateLoadResult.state;
const isStaticDemo = location.hostname.endsWith("github.io") || location.protocol === "file:";
if (isStaticDemo) {
  state.aiMode = "mock";
}

function saveState(nextState = state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return true;
  } catch (error) {
    showToast(
      isStorageQuotaError(error)
        ? "浏览器存储空间不足，本次修改未保存。请导出文档备份或删除旧项目后再试。"
        : `本地保存失败：${error.message || error}`,
      "error"
    );
    return false;
  }
}

function commitState(nextState) {
  if (!saveState(nextState)) return false;
  state = nextState;
  return true;
}

function activeProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || state.projects[0];
}

function route() {
  const value = location.hash.replace(/^#/, "");
  return ROUTES.has(value) ? value : "overview";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attr(value) {
  return escapeHtml(value);
}

function dateText(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function dateTimeText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast visible${type === "error" ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = "toast";
  }, 3600);
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function effortLabel(effort) {
  return ({ low: "低", medium: "中", high: "高", xhigh: "极高" })[effort] || effort || "默认";
}

function expectedLabel(expectedSeconds = []) {
  const [minimum, maximum] = expectedSeconds;
  if (!minimum || !maximum) return "预计耗时视任务而定";
  const format = (seconds) => seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60)} 分钟`;
  return `通常 ${format(minimum)}–${format(maximum)}`;
}

function routeSummary(routeKey) {
  const config = aiRoutes[routeKey] || {};
  return `${modelVariantName(config.model)} · ${effortLabel(config.effort)}`;
}

function routeDetail(routeKey) {
  const config = aiRoutes[routeKey] || {};
  return modelRouteDetail(config.model, effortLabel(config.effort));
}

function runRecordLabel(record) {
  if (!record) return "";
  if (record.source !== "codex") return "演示结果";
  const details = [modelFullName(record.model)];
  if (record.reasoningEffort) details.push(`推理：${effortLabel(record.reasoningEffort)}`);
  if (record.durationMs) details.push(formatDuration(record.durationMs));
  if (record.fallbackUsed) details.push("自动复核");
  return `本机 Codex · ${details.join(" · ")}`;
}

function displayRouteLabel(label) {
  return String(label || "正在生成")
    .replaceAll("Strategy v0", "策略初稿")
    .replaceAll("Launch Pack", "投放执行方案")
    .replaceAll("Experiment Ledger", "实验账本")
    .replaceAll("Mock ", "演示")
    .replaceAll("Codex ", "");
}

function renderAiJobPanel() {
  if (!currentAiJob) {
    aiJobPanel.hidden = true;
    return;
  }
  const config = aiRoutes[currentAiJob.routeKey] || {};
  const live = currentAiJob.live || {};
  aiJobPanel.hidden = false;
  aiJobLabel.textContent = displayRouteLabel(live.label || config.label || "正在生成");
  aiJobMeta.textContent = `${modelFullName(live.model || config.model)} · 推理：${effortLabel(live.effort || config.effort)}${live.fallbackUsed ? " · 结构校验后自动复核中" : ""} · 本机运行`;
  aiJobElapsed.textContent = formatClock(Date.now() - currentAiJob.startedAt);
  aiJobExpected.textContent = expectedLabel(config.expectedSeconds);
  aiCancelButton.disabled = currentAiJob.cancelling;
  aiCancelButton.textContent = currentAiJob.cancelling ? "正在取消…" : "取消生成";
}

async function syncActiveAiJob() {
  if (!currentAiJob || isStaticDemo) return;
  try {
    const payload = await requestJson("./api/health", { cache: "no-store" });
    if (payload.activeJob && currentAiJob) {
      currentAiJob.live = payload.activeJob;
      renderAiJobPanel();
    }
  } catch {
    // The local timer can continue even if a single status poll fails.
  }
}

function beginAiJob(routeKey) {
  clearPersistentError();
  currentAiJob = { routeKey, startedAt: Date.now(), cancelling: false };
  aiJobTicks = 0;
  clearInterval(aiJobTimer);
  renderAiJobPanel();
  aiJobTimer = setInterval(() => {
    aiJobTicks += 1;
    renderAiJobPanel();
    if (aiJobTicks % 2 === 0) syncActiveAiJob();
  }, 1000);
}

function finishAiJob() {
  clearInterval(aiJobTimer);
  aiJobTimer = null;
  currentAiJob = null;
  renderAiJobPanel();
}

function showPersistentError(message) {
  aiErrorMessage.textContent = message;
  aiErrorPanel.hidden = false;
}

function clearPersistentError() {
  aiErrorMessage.textContent = "";
  aiErrorPanel.hidden = true;
}

async function loadAiRuntime() {
  if (isStaticDemo) return;
  try {
    const payload = await requestJson("./api/health", { cache: "no-store" });
    const versionWarning = runtimeVersionWarning(APP_VERSION, payload.version);
    if (versionWarning) showPersistentError(versionWarning);
    if (payload.routes) {
      const merged = { ...aiRoutes, ...payload.routes };
      for (const [key, route] of Object.entries(merged)) {
        if (route && typeof route === "object") {
          merged[key] = { ...route, label: displayRouteLabel(route.label || aiRoutes[key]?.label || key) };
        }
      }
      aiRoutes = merged;
    }
  } catch {
    // Local defaults remain usable if the health endpoint is temporarily unavailable.
  }
}

async function cancelAiJob() {
  if (!currentAiJob || currentAiJob.cancelling) return;
  currentAiJob.cancelling = true;
  renderAiJobPanel();
  try {
    await requestJson("./api/cancel", { method: "POST" });
    showToast("已发送取消请求");
  } catch (error) {
    currentAiJob.cancelling = false;
    renderAiJobPanel();
    showPersistentError(`无法取消：${error.message}`);
  }
}

function handleAiFailure(error) {
  if (isCancelledRequest(error)) {
    clearPersistentError();
    showToast("已取消生成，本次没有写入结果。");
    return;
  }
  const message = error?.message || String(error || "未知错误");
  showToast(`没有写入结果：${message}`, "error");
  showPersistentError(message);
}

function updateProjectById(projectId, mutator) {
  const projectIndex = state.projects.findIndex((item) => item.id === projectId);
  if (projectIndex < 0) return false;
  const project = cloneJson(state.projects[projectIndex]);
  mutator(project);
  project.updatedAt = new Date().toISOString();
  const projects = [...state.projects];
  projects[projectIndex] = project;
  return commitState({ ...state, projects });
}

function updateProject(mutator) {
  return updateProjectById(state.activeProjectId, mutator);
}

function setNested(object, path, value) {
  const keys = path.split(".");
  const finalKey = keys.pop();
  const target = keys.reduce((cursor, key) => {
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    return cursor[key];
  }, object);
  target[finalKey] = value;
}

function pageHeader(eyebrow, title, description, actions = "") {
  return `<header class="page-header">
    <div class="page-header-copy">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p class="page-lead">${escapeHtml(description)}</p>` : ""}
    </div>
    ${actions ? `<div class="inline-actions page-header-actions">${actions}</div>` : ""}
  </header>`;
}

function dataHasField(project, field) {
  const available = project.data?.availableFields;
  if (Array.isArray(available)) return available.includes(field);
  const summary = project.data?.metrics?.summary || {};
  const legacyEvidence = {
    spend: summary.spend,
    impressions: summary.impressions,
    clicks: summary.clicks,
    installs: summary.installs,
    af_installs: summary.af_installs,
    conversions: summary.conversions,
    revenue: summary.revenue,
    d1_retained: summary.d1_retained
  };
  return Number(legacyEvidence[field]) > 0;
}

function availableMetric(project, field, value, type = "number") {
  return dataHasField(project, field) ? formatMetric(value, type, project.currency || "USD") : "—";
}

function metricCards(project) {
  const summary = project.data?.metrics?.summary || {};
  const currency = project.currency || "USD";
  // Keep four primary operator metrics on the overview; detail lives in tables below.
  const cards = [
    ["花费", formatMetric(summary.spend, "currency", currency), project.data ? `${project.data.metrics.rowCount} 行数据` : "待导入 CSV"],
    ["AF 安装", availableMetric(project, "af_installs", summary.af_installs), dataHasField(project, "af_installs") ? "AppsFlyer 归因" : "未导入 AF 安装"],
    ["AF-CPI", dataHasField(project, "af_installs") ? formatMetric(summary.afCpi, "currency", currency) : "—", targetHint(project, "af_cpi")],
    ["ROAS", dataHasField(project, "revenue") ? formatMetric(summary.roas, "ratio") : "—", targetHint(project, "roas")]
  ];
  return `<div class="metric-grid">${cards
    .map(([label, value, hint]) => `<div class="metric-card"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`)
    .join("")}</div>`;
}

function platformTable(project) {
  const rows = project.data?.metrics?.byPlatform || [];
  if (!rows.length) return emptyState("还没有媒体数据", "前往投放优化页导入 CSV，工作台会自动生成媒体与国家表现。", "optimize", "导入数据");
  const hasMediaInstalls = dataHasField(project, "installs");
  const hasAfInstalls = dataHasField(project, "af_installs");
  const hasCtr = dataHasField(project, "clicks") && dataHasField(project, "impressions");
  const hasRevenue = dataHasField(project, "revenue");
  return `<div class="table-wrap"><table>
    <thead><tr><th>媒体</th><th>花费</th>${hasMediaInstalls ? "<th>媒体安装</th><th>媒体 CPI</th>" : ""}${hasAfInstalls ? "<th>AF 安装</th><th>AF-CPI</th>" : ""}${hasCtr ? "<th>CTR</th>" : ""}${hasRevenue ? "<th>ROAS</th>" : ""}</tr></thead>
    <tbody>${rows.map((item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${formatMetric(item.spend, "currency", project.currency)}</td>
      ${hasMediaInstalls ? `<td>${formatMetric(item.installs)}</td><td>${formatMetric(item.cpi, "currency", project.currency)}</td>` : ""}
      ${hasAfInstalls ? `<td>${formatMetric(item.af_installs)}</td><td>${formatMetric(item.afCpi, "currency", project.currency)}</td>` : ""}
      ${hasCtr ? `<td>${formatMetric(item.ctr, "percent")}</td>` : ""}
      ${hasRevenue ? `<td>${formatMetric(item.roas, "ratio")}</td>` : ""}
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function spendBars(project, group = "byCountry") {
  const rows = project.data?.metrics?.[group] || [];
  if (!rows.length) return `<p class="muted">暂无数据</p>`;
  const max = Math.max(...rows.map((row) => row.spend), 1);
  return `<div class="bar-list">${rows.slice(0, 6).map((row) => `<div class="bar-row">
    <strong>${escapeHtml(row.name)}</strong>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (row.spend / max) * 100).toFixed(1)}%"></div></div>
    <div class="bar-value">${dataHasField(project, "af_installs") ? formatMetric(row.afCpi, "currency", project.currency) : dataHasField(project, "installs") ? formatMetric(row.cpi, "currency", project.currency) : "—"}</div>
  </div>`).join("")}</div>`;
}

function emptyState(title, description, targetRoute, buttonLabel) {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>${targetRoute ? `<button class="button button-secondary button-small" data-go-route="${attr(targetRoute)}">${escapeHtml(buttonLabel)}</button>` : ""}</div></div>`;
}

function analysisToolbar(stage) {
  const routeKey = stage === "optimize" ? "optimizeAnalysis" : "analysis";
  const mode = state.aiMode === "codex" ? routeDetail(routeKey) : "本地演示 · 不耗额度";
  const title = stage === "creative" ? "生成素材任务" : "结构化判断";
  const action = stage === "creative" ? "生成素材任务" : "生成分析";
  const mockAction = stage === "creative" ? "生成演示任务" : "运行演示分析";
  return `<div class="analysis-toolbar">
    <div><strong>${title}</strong><span>${escapeHtml(mode)}</span></div>
    <button class="button button-primary" data-run-ai="${attr(stage)}" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在分析…" : state.aiMode === "codex" ? action : mockAction}</button>
  </div>`;
}

function aiResult(project, stage) {
  const record = project.ai?.[stage];
  if (!record?.result) return emptyState("还没有分析结果", "先完善项目信息或导入数据，再运行结构化分析。演示模式只演示界面，不占用模型额度。", "", "");
  const result = record.result;
  const sourceText = runRecordLabel(record);
  return `<div class="ai-result">
    <div class="summary-callout"><strong>${escapeHtml(sourceText)}</strong><br />${escapeHtml(result.executive_summary)}</div>
    ${result.findings.map((item) => `<article class="finding-card">
      <div class="finding-top"><h3>${escapeHtml(item.title)}</h3><div class="badge-row"><span class="priority-badge ${attr(item.priority)}">${escapeHtml(priorityText(item.priority))}</span><span class="confidence-badge">置信度 ${escapeHtml(confidenceText(item.confidence))}</span></div></div>
      <p class="finding-diagnosis">${escapeHtml(item.diagnosis)}</p>
      <div class="finding-body"><div class="evidence-box"><span>证据</span><p>${escapeHtml(item.evidence)}</p></div><div class="action-box"><span>动作</span><p>${escapeHtml(item.action)}</p></div></div>
      <p class="finding-diagnosis"><strong>验证：</strong>${escapeHtml(item.validation)}</p>
    </article>`).join("")}
  </div>`;
}

function priorityText(value) {
  return ({ high: "高优先级", medium: "中优先级", low: "低优先级" })[value] || value;
}

function confidenceText(value) {
  return ({ high: "高", medium: "中", low: "低" })[value] || value;
}

function intakeRecord(project) {
  return project.intake?.analysis || null;
}

function intakeSourceText(value) {
  return ({ offer: "客户资料", client_strategy: "客户策略", operator_notes: "优化师补充", ai_inference: "AI 推断", unknown: "待补充" })[value] || "待补充";
}

function intakeStatusText(value) {
  return ({ confirmed: "已确认", inferred: "待确认", missing: "缺失" })[value] || value;
}

function briefFieldValue(result, key) {
  return result?.brief_fields?.find((field) => field.key === key)?.value || "";
}

function renderStrategyList(title, items, tone = "") {
  return `<section class="strategy-list ${attr(tone)}"><h3>${escapeHtml(title)}</h3><ol>${(items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section>`;
}

function renderIntakeResult(project) {
  const record = intakeRecord(project);
  const result = record?.result;
  if (!result) {
    return `<section class="card">${emptyState("等待第一份客户资料", "把客户资料、客户已有策略和自己的会议记录粘贴到上方。OpenAdOps 会整理简报、标记缺失项，并生成策略初稿。", "", "")}</section>`;
  }
  const counts = { confirmed: 0, inferred: 0, missing: 0 };
  result.brief_fields.forEach((field) => { counts[field.status] = (counts[field.status] || 0) + 1; });
  const draft = result.strategy_draft;
  const questions = result.clarification_questions || [];
  const versions = project.intake?.versions || [];
  const sourceLabel = runRecordLabel(record);

  return `<div class="intake-result-stack">
    <section class="intake-summary">
      <div><span class="card-label">${escapeHtml(sourceLabel)} · ${dateText(record.generatedAt)}</span><p>${escapeHtml(result.executive_summary)}</p></div>
      <div class="intake-counts" aria-label="简报完整度">
        <div class="intake-count confirmed"><strong>${counts.confirmed}</strong><span>已确认</span></div>
        <div class="intake-count inferred"><strong>${counts.inferred}</strong><span>待确认</span></div>
        <div class="intake-count missing"><strong>${counts.missing}</strong><span>缺失</span></div>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>结构化简报</h2><p>编辑任意字段后会自动标记为“优化师已确认”</p></div><span class="card-label">${counts.confirmed}/${result.brief_fields.length} 已确认</span></div>
      <div class="brief-grid">${result.brief_fields.map((field) => {
        const meta = BRIEF_FIELD_META[field.key] || { label: field.key, multiline: false };
        const control = meta.multiline
          ? `<textarea data-brief-key="${attr(field.key)}">${escapeHtml(field.value)}</textarea>`
          : `<input data-brief-key="${attr(field.key)}" value="${attr(field.value)}" />`;
        return `<label class="brief-field ${attr(field.status)}"><span class="brief-label"><strong>${escapeHtml(meta.label)}</strong><em>${escapeHtml(intakeStatusText(field.status))}</em></span>${control}<small>${escapeHtml(intakeSourceText(field.source))} · ${escapeHtml(field.evidence || "待补充")}</small></label>`;
      }).join("")}</div>
    </section>

    <div class="grid intake-decision-grid">
      <section class="card">
        <div class="card-header"><div><h2>客户追问清单</h2><p>按策略影响排序</p></div><div class="inline-actions"><span class="badge question-badge">${questions.length} QUESTIONS</span>${questions.length ? `<button class="button button-ghost button-small" data-copy-questions>复制追问</button>` : ""}</div></div>
        ${questions.length ? `<div class="question-list">${questions.map((item, index) => `<article class="question-item"><span>${String(index + 1).padStart(2, "0")}</span><div><div class="question-top"><strong>${escapeHtml(item.question)}</strong><em class="${attr(item.priority)}">${item.priority === "required" ? "必须确认" : "建议确认"}</em></div><p>${escapeHtml(item.reason)}</p></div></article>`).join("")}</div>` : `<div class="success-note">关键资料已覆盖，建议由项目负责人做最后口径确认。</div>`}
      </section>
      <section class="card strategy-v0-hero">
        <div class="card-header"><div><h2>策略初稿</h2><p>带假设的前期策略草案，不等同于最终执行方案</p></div><span class="card-label">工作草案</span></div>
        <blockquote>${escapeHtml(draft.positioning)}</blockquote>
        <div class="assumption-list"><strong>工作假设</strong>${draft.working_assumptions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-header"><div><h2>媒体角色与预算场景</h2><p>只对入选媒体给出角色；预算缺失时不生成虚假金额</p></div><button class="button button-primary button-small" data-adopt-intake>采用到投放策略</button></div>
      <div class="platform-plan-grid">${draft.platform_plan.map((item) => `<article class="platform-plan-card"><span>${escapeHtml(item.platform)}</span><h3>${escapeHtml(item.role)}</h3><p>${escapeHtml(item.rationale)}</p><small>${escapeHtml(item.budget_scenario)}</small></article>`).join("")}</div>
    </section>

    <div class="grid intake-plan-grid">
      ${renderStrategyList("Campaign 初步结构", draft.campaign_plan)}
      ${renderStrategyList("素材测试方向", draft.creative_plan)}
      ${renderStrategyList("监测与归因口径", draft.measurement_plan)}
      ${renderStrategyList("首周执行计划", draft.first_week_plan)}
      ${renderStrategyList("风险与前置条件", draft.risks, "risk")}
    </div>

    <section class="card version-card">
      <div class="card-header"><div><h2>策略版本</h2></div><button class="button button-secondary button-small" data-save-intake-version>保存当前版本</button></div>
      ${versions.length ? `<div class="version-list">${versions.map((version) => `<div class="version-row"><div><strong>${escapeHtml(version.name)}</strong><span>${dateText(version.savedAt)}</span></div><button class="button button-ghost button-small" data-restore-intake-version="${attr(version.id)}">恢复</button></div>`).join("")}</div>` : `<p class="muted">还没有保存版本。正式发送或采用策略前，建议先保存一份快照。</p>`}
    </section>
  </div>`;
}

function renderIntake(project) {
  const intake = project.intake || createIntake();
  const result = intakeRecord(project)?.result;
  const actions = result
    ? `<button class="button button-ghost" data-export-intake>导出文档</button><button class="button button-secondary" data-save-intake-version>保存版本</button>`
    : "";
  const mode = state.aiMode === "codex"
    ? `智能路由 · 追问：${routeSummary("intakeQuestions")} ｜ 策略初稿：${routeSummary("intakeStrategy")} ｜ 深度复核：${routeSummary("intakeDeep")}`
    : "本地演示 · 不耗额度";
  return `${pageHeader("阶段 00 · 需求接收", "需求接收", "", actions)}
    <section class="card intake-source-card mb-16">
      <div class="card-header"><div><h2>原始资料</h2><p>资料不完整也可以开始；缺失项会明确标出</p></div><span class="card-label">本地保存</span></div>
      <div class="intake-source-grid">
        <label class="source-panel offer"><span><strong>客户资料</strong><em>${textLength(intake.rawOffer)} 字</em></span><textarea data-intake-field="rawOffer" placeholder="粘贴客户发来的产品、市场、目标、预算、KPI、素材、时间等信息……">${escapeHtml(intake.rawOffer)}</textarea></label>
        <label class="source-panel strategy"><span><strong>客户已有策略</strong><em>${textLength(intake.clientStrategy)} 字</em></span><select data-intake-field="strategyAuthority"><option value="reference" ${intake.strategyAuthority !== "mandatory" ? "selected" : ""}>仅供参考，可调整</option><option value="mandatory" ${intake.strategyAuthority === "mandatory" ? "selected" : ""}>必须执行的约束</option></select><textarea data-intake-field="clientStrategy" placeholder="粘贴客户给出的媒体、预算或素材建议；没有可以留空。">${escapeHtml(intake.clientStrategy)}</textarea></label>
        <label class="source-panel notes"><span><strong>我的补充</strong><em>${textLength(intake.operatorNotes)} 字</em></span><textarea data-intake-field="operatorNotes" placeholder="补充会议记录、自己的判断、待确认问题与不能忽略的限制……">${escapeHtml(intake.operatorNotes)}</textarea></label>
      </div>
      <div class="intake-runbar">
        <div><strong>本页主操作</strong><span>${escapeHtml(mode)}</span></div>
        <div class="inline-actions">
          <button class="button button-ghost" data-run-intake="questions" ${aiBusy ? "disabled" : ""}>${aiBusy ? "处理中…" : "生成追问"}</button>
          <button class="button button-ghost" data-run-intake="deep" ${aiBusy ? "disabled" : ""}>${aiBusy ? "请稍候…" : "深度复核"}</button>
          <button class="button button-primary" data-run-intake="strategy" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : state.aiMode === "codex" ? "生成策略初稿" : "生成演示策略"}</button>
        </div>
      </div>
    </section>
    ${renderIntakeResult(project)}`;
}

function textLength(value) {
  return String(value || "").trim().length;
}

function renderOverview(project) {
  const hasIntake = Boolean(project.intake?.analysis?.result);
  const hasStrategy = Boolean(project.strategy?.objective && project.strategy?.testLogic);
  const hasCreative = Boolean(creativeTasks(project).length);
  const launchPack = project.launch?.pack?.result;
  const launchReady = Boolean(launchPack);
  const hasExperiments = Boolean(project.experiments?.plan?.result?.experiments?.length);
  const hasOptimize = Boolean(project.data?.metrics && (project.ai?.optimize || project.ai?.strategy));
  return `${pageHeader("项目总览", project.name, "")}
    ${metricCards(project)}
    <div class="grid overview-grid mb-16">
      <section class="card">
        <div class="card-header"><div><h2>全链路进度</h2></div><button class="button button-primary button-small" data-go-route="report">查看报告</button></div>
        <div class="stage-flow">
          <button type="button" class="stage-step ${hasIntake ? "complete" : ""}" data-step="00" data-go-route="intake"><h3>需求接收</h3><p>资料、追问与策略初稿</p></button>
          <button type="button" class="stage-step ${hasStrategy ? "complete" : ""}" data-step="01" data-go-route="strategy"><h3>投放策略</h3><p>目标、媒体与预算逻辑</p></button>
          <button type="button" class="stage-step ${hasCreative ? "complete" : ""}" data-step="02" data-go-route="creative"><h3>素材生产</h3><p>任务、交付与状态</p></button>
          <button type="button" class="stage-step ${launchReady ? "complete" : ""}" data-step="03" data-go-route="launch"><h3>执行方案</h3><p>Campaign 与上线检查</p></button>
          <button type="button" class="stage-step ${hasExperiments ? "complete" : ""}" data-step="04" data-go-route="experiments"><h3>实验台</h3><p>样本门槛与学习</p></button>
          <button type="button" class="stage-step ${hasOptimize ? "complete" : ""}" data-step="05" data-go-route="optimize"><h3>投放优化</h3><p>数据诊断与动作</p></button>
        </div>
      </section>
      <aside class="card">
        <div class="card-header"><div><h2>项目档案</h2></div></div>
        <div class="project-facts">
          <div class="fact-row"><span>行业</span><strong>${escapeHtml(project.industry)} App</strong></div>
          <div class="fact-row"><span>媒体</span><strong>${escapeHtml(project.platforms.join(" · "))}</strong></div>
          <div class="fact-row"><span>市场</span><strong>${escapeHtml(project.markets || "待设置")}</strong></div>
          <div class="fact-row"><span>目标</span><strong>${escapeHtml(project.goal)} · ${escapeHtml(project.attribution)}</strong></div>
          <div class="fact-row"><span>月预算</span><strong>${formatMetric(project.budget, "currency", project.currency)}</strong></div>
          <div class="fact-row"><span>最近更新</span><strong>${dateText(project.updatedAt)}</strong></div>
        </div>
      </aside>
    </div>
    <section class="card mb-16"><div class="card-header"><div><h2>媒体表现矩阵</h2><p>媒体口径与 AF 口径并列，避免只看平台安装</p></div><span class="card-label">MEDIA × ATTRIBUTION</span></div>${platformTable(project)}</section>
    <section class="card"><div class="card-header"><div><h2>国家效率</h2><p>横条为花费占比，右侧优先显示 AF-CPI；缺失时显示媒体 CPI</p></div></div>${spendBars(project)}</section>`;
}

function performanceTargetEditor(project) {
  const targets = normalizePerformanceTargets(project);
  const usedMetrics = new Set(targets.map((item) => item.metric));
  const rows = targets.map((target) => {
    const metricOptions = PERFORMANCE_TARGET_METRICS.map((metric) => `<option value="${attr(metric.value)}" ${target.metric === metric.value ? "selected" : ""} ${usedMetrics.has(metric.value) && target.metric !== metric.value ? "disabled" : ""}>${escapeHtml(metric.label)}</option>`).join("");
    const statusOptions = PERFORMANCE_TARGET_STATUSES.map((status) => `<option value="${attr(status.value)}" ${target.status === status.value ? "selected" : ""}>${escapeHtml(status.label)}</option>`).join("");
    const threshold = target.status === "observe"
      ? `<div class="target-readonly"><span>阈值</span><strong>暂不填写</strong></div>`
      : `<label class="target-control"><span>目标值</span><input type="number" min="0.01" step="0.01" data-target-id="${attr(target.id)}" data-target-field="value" value="${attr(target.value ?? "")}" placeholder="必须大于 0" /></label>`;
    const context = target.metric === "cpa"
      ? `<label class="target-control"><span>转化事件</span><input data-target-id="${attr(target.id)}" data-target-field="event" value="${attr(target.event)}" placeholder="如 Purchase" /></label>`
      : target.metric === "roas"
        ? `<label class="target-control"><span>回收周期</span><select data-target-id="${attr(target.id)}" data-target-field="window"><option value="">待确认</option>${["D0", "D1", "D7", "D30"].map((window) => `<option value="${window}" ${target.window === window ? "selected" : ""}>${window}</option>`).join("")}</select></label>`
        : `<div class="target-readonly"><span>口径</span><strong>${escapeHtml(project.currency || "USD")}</strong></div>`;
    return `<article class="performance-target-row">
      <label class="target-control"><span>衡量指标</span><select data-target-id="${attr(target.id)}" data-target-field="metric">${metricOptions}</select></label>
      <label class="target-control"><span>目标状态</span><select data-target-id="${attr(target.id)}" data-target-field="status">${statusOptions}</select></label>
      ${threshold}
      ${context}
      <div class="target-row-actions">
        <label><input type="radio" name="primary-performance-target" data-target-primary="${attr(target.id)}" ${target.primary ? "checked" : ""} />主要指标</label>
        <button type="button" class="button button-ghost button-small" data-remove-performance-target="${attr(target.id)}">删除</button>
      </div>
    </article>`;
  }).join("");

  return `<section class="performance-target-editor field-wide">
    <div class="performance-target-header">
      <div><strong>衡量与目标</strong><span>可以只观察指标，不必在学习期提前填写 KPI</span></div>
      <button type="button" class="button button-secondary button-small" data-add-performance-target ${targets.length >= PERFORMANCE_TARGET_METRICS.length ? "disabled" : ""}>＋ 添加衡量指标</button>
    </div>
    ${rows ? `<div class="performance-target-list">${rows}</div>` : `<div class="performance-target-empty"><strong>暂未设置目标</strong><span>当前按学习期处理；先跑量建立基线，不会把 0 当作 KPI。</span></div>`}
    <label class="field target-review"><span>基线复盘条件（可选）</span><input data-project-field="targetReview" value="${attr(project.targetReview || "")}" placeholder="例如：运行 7 天或累计 50 次转化后复盘" /></label>
  </section>`;
}

function nextPerformanceTargetMetric(project, targets) {
  const used = new Set(targets.map((item) => item.metric));
  const preferred = project.goal === "ROAS"
    ? "roas"
    : ["Registration", "Purchase"].includes(project.goal)
      ? "cpa"
      : ["AppsFlyer", "Adjust"].includes(project.attribution)
        ? "af_cpi"
        : "media_cpi";
  return [preferred, ...PERFORMANCE_TARGET_METRICS.map((item) => item.value)].find((metric) => !used.has(metric)) || "";
}

function renderStrategy(project) {
  return `${pageHeader("阶段 01 · 投放策略", "投放策略", "")}
    <div class="grid grid-2 mb-16">
      <section class="card">
        <div class="card-header"><div><h2>项目输入</h2><p>这些信息会随聚合指标一起发送给本机模型</p></div></div>
        <div class="form-grid two-columns">
          <label class="field"><span>目标市场</span><input data-project-field="markets" value="${attr(project.markets)}" /></label>
          <label class="field"><span>项目阶段</span><select data-project-field="stage">${["准备期", "测试期", "放量期", "稳定期"].map((value) => `<option ${project.stage === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="field"><span>主要目标</span><select data-project-field="goal">${[["Install", "安装"], ["Registration", "注册"], ["Purchase", "付费"], ["ROAS", "ROAS"]].map(([value, label]) => `<option value="${value}" ${project.goal === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label class="field"><span>归因来源</span><select data-project-field="attribution">${["AppsFlyer", "Adjust", "媒体后台", "GA4"].map((value) => `<option ${project.attribution === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="field"><span>月预算</span><input type="number" step="1" data-project-field="budget" value="${attr(project.budget)}" /></label>
          ${performanceTargetEditor(project)}
          <label class="field field-wide"><span>产品卖点</span><textarea data-project-field="sellingPoints">${escapeHtml(project.sellingPoints)}</textarea></label>
          <label class="field field-wide"><span>补充说明</span><textarea data-project-field="notes">${escapeHtml(project.notes)}</textarea></label>
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h2>策略假设</h2></div></div>
        <div class="form-grid">
          <label class="field"><span>阶段目标</span><textarea data-project-field="strategy.objective">${escapeHtml(project.strategy?.objective || "")}</textarea></label>
          <label class="field"><span>核心用户</span><textarea data-project-field="strategy.audience">${escapeHtml(project.strategy?.audience || "")}</textarea></label>
          <label class="field"><span>预算逻辑</span><textarea data-project-field="strategy.budgetLogic">${escapeHtml(project.strategy?.budgetLogic || "")}</textarea></label>
          <label class="field"><span>测试逻辑</span><textarea data-project-field="strategy.testLogic">${escapeHtml(project.strategy?.testLogic || "")}</textarea></label>
        </div>
      </section>
    </div>
    <section class="card mb-16"><div class="card-header"><div><h2>媒体预算分工</h2><p>数值为策略起点，不代替后续数据判断</p></div><span class="card-label">TOTAL ${project.platforms.reduce((sum, platform) => sum + Number(project.strategy?.budgetShares?.[platform] || 0), 0)}%</span></div>
      <div class="grid grid-3">${project.platforms.map((platform) => `<label class="field"><span>${escapeHtml(platform)} 占比</span><input type="number" min="0" max="100" data-budget-platform="${attr(platform)}" value="${attr(project.strategy?.budgetShares?.[platform] ?? Math.round(100 / project.platforms.length))}" /></label>`).join("")}</div>
    </section>
    <section class="card">${analysisToolbar("strategy")}${aiResult(project, "strategy")}</section>`;
}

function creativeTaskOptions(values, current) {
  return [...new Set([...values, current].filter(Boolean))].map((value) => `<option value="${attr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function creativeTaskCard(project, task, index) {
  const sourceLabel = ({ manual: "人工任务", analysis: "AI 素材方向", launch_pack: "执行方案", legacy: "历史计划" })[task.source] || "任务";
  const statusOptions = CREATIVE_TASK_STATUSES.map((item) => `<option value="${item.value}" ${item.value === task.status ? "selected" : ""}>${item.label}</option>`).join("");
  const platformOptions = creativeTaskOptions(project.platforms || [], task.platform);
  const deliverableOptions = creativeTaskOptions(["视频", "图片", "广告文案", "商店页资产", "其他"], task.deliverable);
  const taskId = attr(task.id);
  const field = (name) => `data-creative-task-id="${taskId}" data-creative-task-field="${name}"`;
  return `<article class="creative-production-task">
    <div class="creative-task-header">
      <div><span class="card-label">#${String(index + 1).padStart(2, "0")} · ${escapeHtml(sourceLabel)}</span><h3>${escapeHtml(task.angle || "未命名素材任务")}</h3><p>${escapeHtml(task.platform)} · ${escapeHtml(task.market || "市场待确认")} · ${task.quantity} 个版本</p></div>
      <div class="creative-task-actions"><select class="creative-status-select" aria-label="任务状态" ${field("status")}>${statusOptions}</select><button type="button" class="button button-danger button-small" data-remove-creative-task="${taskId}">删除</button></div>
    </div>
    <div class="creative-task-section">
      <span class="creative-task-section-title">交付信息</span>
      <div class="creative-task-operational-grid">
        <label class="field"><span>媒体</span><select ${field("platform")}>${platformOptions}</select></label>
        <label class="field"><span>市场</span><input ${field("market")} value="${attr(task.market)}" placeholder="例如：JP" /></label>
        <label class="field"><span>语言</span><input ${field("language")} value="${attr(task.language)}" placeholder="例如：日语" /></label>
        <label class="field"><span>素材类型</span><select ${field("deliverable")}>${deliverableOptions}</select></label>
        <label class="field"><span>规格</span><input ${field("format")} value="${attr(task.format)}" placeholder="例如：9:16 · 15 秒" /></label>
        <label class="field"><span>版本数</span><input type="number" min="1" max="100" ${field("quantity")} value="${attr(task.quantity)}" /></label>
        <label class="field"><span>负责人</span><input ${field("owner")} value="${attr(task.owner)}" placeholder="待分配" /></label>
        <label class="field"><span>截止日期</span><input type="date" ${field("dueDate")} value="${attr(task.dueDate)}" /></label>
      </div>
    </div>
    <div class="creative-task-section">
      <span class="creative-task-section-title">测试与制作要求</span>
      <div class="creative-task-brief-grid">
        <label class="field"><span>素材角度</span><input ${field("angle")} value="${attr(task.angle)}" placeholder="本条素材要证明什么" /></label>
        <label class="field"><span>单一变量</span><input ${field("testVariable")} value="${attr(task.testVariable)}" placeholder="本轮只改变一个变量" /></label>
        <label class="field field-wide"><span>Hook</span><textarea ${field("hook")} placeholder="首帧或前 3 秒表达">${escapeHtml(task.hook)}</textarea></label>
        <label class="field field-wide"><span>测试假设</span><textarea ${field("hypothesis")} placeholder="如果改变 X，预计 Y 会出现可判断变化">${escapeHtml(task.hypothesis)}</textarea></label>
        <label class="field"><span>成功指标</span><input ${field("successMetric")} value="${attr(task.successMetric)}" placeholder="观察期，暂无阈值" /></label>
        <label class="field"><span>素材链接 / 文件名</span><input ${field("assetLink")} value="${attr(task.assetLink)}" placeholder="交付后补充" /></label>
        <label class="field"><span>制作备注</span><textarea ${field("productionNotes")} placeholder="字幕、安全区、镜头、CTA 等">${escapeHtml(task.productionNotes)}</textarea></label>
        <label class="field"><span>合规要求</span><textarea ${field("complianceNotes")} placeholder="禁用表达、功能边界、审核要求等">${escapeHtml(task.complianceNotes)}</textarea></label>
      </div>
    </div>
  </article>`;
}

function renderCreative(project) {
  const tasks = creativeTasks(project);
  const summary = creativeProductionSummary(tasks);
  const actions = `<button class="button button-ghost" data-export-creative-markdown>导出文档</button><button class="button button-secondary" data-export-creative-csv>导出 CSV</button><button class="button button-primary" data-add-creative-task>＋ 新建任务</button>`;
  return `${pageHeader("阶段 02 · 素材生产", "素材生产计划", "", actions)}
    <div class="metric-grid creative-production-metrics">
      <article class="metric-card"><span>生产任务</span><strong>${summary.tasks}</strong><small>按媒体与市场拆分</small></article>
      <article class="metric-card"><span>计划版本</span><strong>${summary.versions}</strong><small>所有任务版本数合计</small></article>
      <article class="metric-card"><span>待审核</span><strong>${summary.review}</strong><small>${summary.overdue ? `${summary.overdue} 项已逾期` : "当前无逾期任务"}</small></article>
      <article class="metric-card"><span>已交付 / 上线</span><strong>${summary.completed}</strong><small>生产闭环完成数</small></article>
    </div>
    <section class="card mb-16"><div class="card-header"><div><h2>生产任务</h2></div><span class="badge" style="color:var(--accent-deep);background:var(--accent-soft)">${tasks.length} TASKS</span></div>${tasks.length ? `<div class="creative-production-list">${tasks.map((task, index) => creativeTaskCard(project, task, index)).join("")}</div>` : emptyState("还没有生产任务", "新建任务，或运行 AI 生成第一批素材方向。", "", "")}</section>
    <section class="card">${analysisToolbar("creative")}${aiResult(project, "creative")}</section>`;
}

function launchPackRecord(project) {
  return project.launch?.pack || null;
}

function launchStatusText(status) {
  return ({ ready: "可上线", conditional: "有条件就绪", blocked: "存在阻塞", needs_confirmation: "待确认", blocker: "阻塞项" })[status] || status;
}

function launchBudgetText(item) {
  if (item.budget_amount === null) return "待确认";
  if (Number(item.budget_amount) === 0) return "本轮暂缓";
  return formatMetric(item.budget_amount, "currency", item.currency);
}

function renderLaunchPackResult(project) {
  const record = launchPackRecord(project);
  const pack = record?.result;
  if (!pack) {
    return `<section class="card launch-empty-card">
      <div class="launch-empty-copy"><span class="card-label">需求 → 执行</span><h2>生成第一份投放执行方案</h2><p>生成 Campaign 蓝图、上线检查和首 7 天行动。</p></div>
      <div class="launch-input-summary">
        <div><span>行业</span><strong>${escapeHtml(project.industry || "待确认")}</strong></div>
        <div><span>市场</span><strong>${escapeHtml(project.markets || "待确认")}</strong></div>
        <div><span>媒体</span><strong>${escapeHtml(project.platforms.join(" · "))}</strong></div>
        <div><span>预算</span><strong>${Number(project.budget) > 0 ? formatMetric(project.budget, "currency", project.currency) : "待确认"}</strong></div>
      </div>
    </section>`;
  }

  const readiness = pack.readiness;
  const versions = project.launch?.versions || [];
  const sourceLabel = runRecordLabel(record);
  const statusOptions = (current) => ["ready", "needs_confirmation", "blocker"].map((status) => `<option value="${status}" ${status === current ? "selected" : ""}>${launchStatusText(status)}</option>`).join("");
  return `<div class="launch-pack-stack">
    <section class="launch-readiness ${attr(readiness.status)}">
      <div class="readiness-score"><strong>${readiness.score}</strong><span>/ 100</span></div>
      <div class="readiness-copy"><span class="card-label">${escapeHtml(sourceLabel)} · ${dateText(record.generatedAt)}</span><h2>${escapeHtml(launchStatusText(readiness.status))}</h2><p>${escapeHtml(pack.executive_summary)}</p></div>
      <div class="readiness-blockers"><span>阻塞项</span><strong>${readiness.blockers.length}</strong><small>${readiness.blockers.length ? escapeHtml(readiness.blockers[0]) : "没有硬阻塞项"}</small></div>
    </section>

    ${pack.assumptions.length ? `<section class="assumption-banner"><strong>当前假设</strong><div>${pack.assumptions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : ""}

    <section class="card">
      <div class="card-header"><div><h2>媒体分工与预算</h2><p>预算缺失时保持为空；预算不足时主动收敛媒体</p></div><span class="card-label">MEDIA PLAN</span></div>
      <div class="table-wrap"><table class="launch-media-table"><thead><tr><th>媒体</th><th>角色</th><th>Campaign 类型</th><th>占比</th><th>月预算</th><th>前置条件</th></tr></thead><tbody>${pack.media_plan.map((item) => `<tr class="${Number(item.allocation_percent) === 0 ? "muted-row" : ""}"><td><strong>${escapeHtml(item.platform)}</strong><small>${escapeHtml(item.objective)}</small></td><td>${escapeHtml(item.role)}<small>${escapeHtml(item.rationale)}</small></td><td>${escapeHtml(item.campaign_type)}</td><td>${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`}</td><td>${escapeHtml(launchBudgetText(item))}</td><td>${item.prerequisites.map((value) => `<span class="mini-tag">${escapeHtml(value)}</span>`).join("")}</td></tr>`).join("")}</tbody></table></div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Campaign 蓝图</h2></div><span class="badge launch-count">${pack.campaigns.length} CAMPAIGNS</span></div>
      <div class="campaign-blueprint-grid">${pack.campaigns.map((item) => `<article class="campaign-blueprint"><div class="campaign-code"><span>${escapeHtml(item.platform)}</span><strong>${escapeHtml(item.campaign_name)}</strong></div><div class="campaign-facts"><div><span>优化事件</span><strong>${escapeHtml(item.optimization_event)}</strong></div><div><span>市场</span><strong>${escapeHtml(item.geo)}</strong></div><div><span>出价</span><strong>${escapeHtml(item.bidding)}</strong></div><div><span>预算</span><strong>${escapeHtml(item.budget_note)}</strong></div></div><div class="campaign-lists"><div><span>结构逻辑</span>${item.ad_group_logic.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div><div><span>受众与排除</span>${item.audience_notes.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div></div></article>`).join("")}</div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>素材生产简报</h2><p>每张卡片只有一个主要测试变量，并预先写明成功指标</p></div><span class="badge launch-count">${pack.creative_briefs.length} 条</span></div>
      <div class="launch-creative-grid">${pack.creative_briefs.map((item) => `<article class="launch-creative-card"><div class="creative-card-top"><span>${escapeHtml(item.platform)}</span><em>${item.variants} 个版本</em></div><h3>${escapeHtml(item.angle)}</h3><blockquote>${escapeHtml(item.hook)}</blockquote><p><strong>假设：</strong>${escapeHtml(item.hypothesis)}</p><dl><div><dt>格式</dt><dd>${escapeHtml(item.format)}</dd></div><div><dt>单变量</dt><dd>${escapeHtml(item.test_variable)}</dd></div><div><dt>成功指标</dt><dd>${escapeHtml(item.success_metric)}</dd></div></dl><div class="production-notes">${item.production_notes.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div><div class="compliance-note">${item.compliance_notes.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div></article>`).join("")}</div>
    </section>

    <div class="grid launch-measurement-grid">
      <section class="card"><div class="card-header"><div><h2>监测与归因</h2><p>媒体反馈、MMP 和业务真相分层使用</p></div><span class="card-label">监测口径</span></div><div class="measurement-hero"><span>最终口径</span><strong>${escapeHtml(pack.measurement.source_of_truth)}</strong></div>${renderStrategyList("主要与辅助事件", [pack.measurement.primary_event, ...pack.measurement.supporting_events])}${renderStrategyList("归因规则", pack.measurement.attribution_rules)}${renderStrategyList("追踪检查", pack.measurement.tracking_checklist)}</section>
      <section class="card"><div class="card-header"><div><h2>首 7 天行动</h2></div><span class="card-label">第 0–7 天</span></div><div class="launch-week">${pack.first_7_days.map((item) => `<article><span>${escapeHtml(item.period)}</span><div>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<strong>${escapeHtml(item.decision_rule)}</strong></div></article>`).join("")}</div></section>
    </div>

    <section class="card">
      <div class="card-header"><div><h2>上线检查项</h2><p>你可以人工更新状态；阻塞项会自动反映到顶部就绪度</p></div><span class="card-label">负责人 × 证据</span></div>
      <div class="table-wrap"><table class="launch-gate-table"><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${pack.launch_checklist.map((item) => `<tr><td><span class="gate-category">${escapeHtml(item.category)}</span></td><td><strong>${escapeHtml(item.item)}</strong></td><td><select class="gate-status ${attr(item.status)}" data-launch-status="${attr(item.id)}">${statusOptions(item.status)}</select></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.evidence)}</td></tr>`).join("")}</tbody></table></div>
    </section>

    <div class="grid grid-2">
      <section class="card"><div class="card-header"><div><h2>待确认问题</h2></div><span class="badge question-badge">${pack.open_questions.length}</span></div>${pack.open_questions.length ? `<ol class="launch-question-list">${pack.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<div class="success-note">当前没有未记录的问题。</div>`}</section>
      <section class="card"><div class="card-header"><div><h2>风险说明</h2><p>不把 AI 草案伪装成正式客户结论</p></div><span class="card-label">RISK REGISTER</span></div><div class="launch-risk-list">${pack.risks.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div></section>
    </div>

    <section class="card version-card">
      <div class="card-header"><div><h2>投放执行方案版本</h2><p>在发送客户或开始搭建前保存快照</p></div><button class="button button-secondary button-small" data-save-launch-version>保存当前版本</button></div>
      ${versions.length ? `<div class="version-list">${versions.map((version) => `<div class="version-row"><div><strong>${escapeHtml(version.name)}</strong><span>${dateText(version.savedAt)}</span></div><button class="button button-ghost button-small" data-restore-launch-version="${attr(version.id)}">恢复</button></div>`).join("")}</div>` : `<p class="muted">还没有保存投放执行方案快照。</p>`}
    </section>
  </div>`;
}

function renderLaunch(project) {
  const record = launchPackRecord(project);
  const actions = record?.result
    ? `<button class="button button-ghost" data-export-launch-pack>导出文档</button><button class="button button-ghost" data-export-launch-html>导出网页</button><button class="button button-secondary" data-save-launch-version>保存版本</button>`
    : "";
  const mode = state.aiMode === "codex" ? routeDetail("launchPack") : "本地演示 · 不耗额度";
  return `${pageHeader("阶段 03 · 执行方案", "投放执行方案", "", actions)}
    <section class="card launch-runbar mb-16"><div><strong>本页主操作</strong><span>${escapeHtml(mode)} · 只生成计划，不改广告账户</span></div><button class="button button-primary" data-run-launch-pack ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : state.aiMode === "codex" ? "生成执行方案" : "生成演示执行方案"}</button></section>
    ${renderLaunchPackResult(project)}`;
}

function experimentPlanRecord(project) {
  return project.experiments?.plan || null;
}

function experimentPriorityText(value) {
  return ({ now: "现在验证", next: "下一轮", later: "候选池" })[value] || value;
}

function experimentStatusText(value) {
  return ({ draft: "草案", ready: "可启动", running: "进行中", concluded: "已结束", archived: "已归档" })[value] || value;
}

function experimentOutcomeText(value) {
  return ({ pending: "等待结果", winner: "实验组胜出", loser: "对照组胜出", inconclusive: "无明确结论" })[value] || value;
}

function feasibilityText(value) {
  return ({ ready: "可在计划周期判断", long_horizon: "周期偏长", insufficient_volume: "流量不足", not_calculable: "等待数据" })[value] || value;
}

function nullableValue(value) {
  return value === null || value === undefined ? "" : value;
}

function experimentOptions(values, current, labels) {
  return values.map((value) => `<option value="${value}" ${value === current ? "selected" : ""}>${escapeHtml(labels(value))}</option>`).join("");
}

function experimentLane(plan, priority) {
  const items = plan.experiments.filter((item) => item.priority === priority);
  return `<section class="experiment-lane ${attr(priority)}">
    <header><div><span>${escapeHtml(experimentPriorityText(priority))}</span><strong>${items.length}</strong></div><small>${priority === "now" ? "本轮只保留最高价值不确定性" : priority === "next" ? "当前实验结束后再启动" : "尚未进入正式排期"}</small></header>
    <div>${items.length ? items.map((item) => `<button class="experiment-lane-card" data-scroll-experiment="${attr(item.id)}"><span>${escapeHtml(item.platform)}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.design.single_variable)} · ${escapeHtml(feasibilityText(item.feasibility.status))}</small></button>`).join("") : `<p>暂无实验</p>`}</div>
  </section>`;
}

function renderExperimentCard(experiment, index) {
  const feasibility = experiment.feasibility;
  const result = experiment.result;
  const resultReady = experiment.status === "concluded";
  return `<details class="experiment-card" id="experiment-${attr(experiment.id)}" ${index === 0 ? "open" : ""}>
    <summary>
      <span class="experiment-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="experiment-summary-copy"><span>${escapeHtml(experiment.platform)} · ${escapeHtml(experiment.design.test_type)}</span><strong>${escapeHtml(experiment.name)}</strong><small>${escapeHtml(experiment.design.single_variable)} → ${escapeHtml(experiment.design.primary_metric)}</small></div>
      <div class="experiment-summary-badges"><span class="experiment-status ${attr(experiment.status)}">${escapeHtml(experimentStatusText(experiment.status))}</span><span class="feasibility-status ${attr(feasibility.status)}">${escapeHtml(feasibilityText(feasibility.status))}</span></div>
    </summary>
    <div class="experiment-card-body">
      <section class="hypothesis-block">
        <span>HYPOTHESIS</span>
        <p><strong>IF</strong> ${escapeHtml(experiment.hypothesis.change)} <strong>THEN</strong> ${escapeHtml(experiment.hypothesis.metric)} 将${experiment.hypothesis.direction === "increase" ? "提升" : "下降"}${experiment.hypothesis.expected_lift_percent === null ? "" : `约 ${experiment.hypothesis.expected_lift_percent}%`} <strong>BECAUSE</strong> ${escapeHtml(experiment.hypothesis.because)}</p>
      </section>

      <div class="experiment-control-row">
        <label><span>优先级</span><select data-experiment-field="priority" data-experiment-id="${attr(experiment.id)}">${experimentOptions(["now", "next", "later"], experiment.priority, experimentPriorityText)}</select></label>
        <label><span>运行状态</span><select data-experiment-field="status" data-experiment-id="${attr(experiment.id)}">${experimentOptions(["draft", "ready", "running", "concluded", "archived"], experiment.status, experimentStatusText)}</select></label>
        <div><span>Owner</span><strong>${escapeHtml(experiment.owner)}</strong></div>
        <div><span>Category</span><strong>${escapeHtml(experiment.category)}</strong></div>
      </div>

      <div class="experiment-variant-grid">
        <article class="experiment-variant control"><span>CONTROL · ${experiment.design.control_percent}%</span><strong>${escapeHtml(experiment.design.control)}</strong></article>
        <div class="experiment-variable"><span>ONLY CHANGE</span><strong>${escapeHtml(experiment.design.single_variable)}</strong></div>
        <article class="experiment-variant variant"><span>VARIANT · ${experiment.design.variant_percent}%</span><strong>${escapeHtml(experiment.design.variant)}</strong></article>
      </div>

      <div class="experiment-feasibility-grid">
        <section class="feasibility-panel ${attr(feasibility.status)}">
          <div><span>可行性</span><strong>${escapeHtml(feasibilityText(feasibility.status))}</strong></div>
          <div class="feasibility-numbers">
            <p><span>每版本样本</span><strong>${feasibility.required_sample_per_variant === null ? "—" : formatMetric(feasibility.required_sample_per_variant)}</strong></p>
            <p><span>预计周期</span><strong>${feasibility.estimated_duration_days === null ? "—" : `${feasibility.estimated_duration_days} 天`}</strong></p>
            <p><span>置信度</span><strong>${experiment.design.confidence_percent}%</strong></p>
          </div>
          <small>${escapeHtml(feasibility.rationale)}</small>
        </section>
        <section class="experiment-calculator">
          <div class="card-header"><div><h3>样本与周期输入</h3><p>仅对比例指标计算；修改后由代码立即重算</p></div><span class="card-label">95/80 OR PLATFORM NATIVE</span></div>
          <div class="experiment-input-grid">
            <label><span>基准转化率 %</span><input type="number" step="0.01" min="0.01" max="99.99" data-experiment-field="design.baseline_rate_percent" data-experiment-id="${attr(experiment.id)}" value="${attr(nullableValue(experiment.design.baseline_rate_percent))}" placeholder="例如 5" /></label>
            <label><span>MDE %</span><input type="number" step="1" min="1" data-experiment-field="design.mde_percent" data-experiment-id="${attr(experiment.id)}" value="${attr(nullableValue(experiment.design.mde_percent))}" /></label>
            <label><span>每日可进入样本</span><input type="number" step="1" min="1" data-experiment-field="design.daily_eligible_units" data-experiment-id="${attr(experiment.id)}" value="${attr(nullableValue(experiment.design.daily_eligible_units))}" placeholder="Clicks / eligible users" /></label>
            <label><span>最短天数</span><input type="number" step="1" min="1" data-experiment-field="design.minimum_days" data-experiment-id="${attr(experiment.id)}" value="${attr(experiment.design.minimum_days)}" /></label>
          </div>
        </section>
      </div>

      <div class="grid experiment-rule-grid">
        <section><span>主要与护栏指标</span><strong>${escapeHtml(experiment.design.primary_metric)}</strong>${experiment.design.guardrail_metrics.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>
        <section><span>媒体后台设置</span>${experiment.setup_steps.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>
        <section><span>停止条件</span>${experiment.stop_conditions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</section>
      </div>

      <section class="decision-rule-strip">
        <div><span>WIN</span><p>${escapeHtml(experiment.decision_rules.win)}</p></div>
        <div><span>LOSE</span><p>${escapeHtml(experiment.decision_rules.lose)}</p></div>
        <div><span>INCONCLUSIVE</span><p>${escapeHtml(experiment.decision_rules.inconclusive)}</p></div>
      </section>

      <section class="experiment-result-panel ${resultReady ? "concluded" : ""}">
        <div class="card-header"><div><h3>结果与学习</h3><p>先填证据和结论，再把状态改为“已结束”</p></div><span class="experiment-outcome ${attr(result.outcome)}">${escapeHtml(experimentOutcomeText(result.outcome))}</span></div>
        <div class="experiment-result-grid">
          <label><span>结论</span><select data-experiment-field="result.outcome" data-experiment-id="${attr(experiment.id)}">${experimentOptions(["pending", "winner", "loser", "inconclusive"], result.outcome, experimentOutcomeText)}</select></label>
          <label><span>对照组结果</span><input type="number" step="0.01" data-experiment-field="result.control_value" data-experiment-id="${attr(experiment.id)}" value="${attr(nullableValue(result.control_value))}" /></label>
          <label><span>实验组结果</span><input type="number" step="0.01" data-experiment-field="result.variant_value" data-experiment-id="${attr(experiment.id)}" value="${attr(nullableValue(result.variant_value))}" /></label>
          <label><span>相对变化</span><input value="${result.relative_change_percent === null ? "—" : `${result.relative_change_percent}%`}" disabled /></label>
          <label><span>开始日期</span><input type="date" data-experiment-field="result.started_at" data-experiment-id="${attr(experiment.id)}" value="${attr(result.started_at)}" /></label>
          <label><span>结束日期</span><input type="date" data-experiment-field="result.ended_at" data-experiment-id="${attr(experiment.id)}" value="${attr(result.ended_at)}" /></label>
          <label class="field-wide"><span>证据</span><textarea data-experiment-field="result.evidence" data-experiment-id="${attr(experiment.id)}" placeholder="原生实验截图、报表路径、数据范围与归因口径">${escapeHtml(result.evidence)}</textarea></label>
          <label class="field-wide"><span>学习结论</span><textarea data-experiment-field="result.learning" data-experiment-id="${attr(experiment.id)}" placeholder="我们学到了什么，而不只是哪个版本赢了">${escapeHtml(result.learning)}</textarea></label>
          <label class="field-wide"><span>下一步动作</span><textarea data-experiment-field="result.next_action" data-experiment-id="${attr(experiment.id)}" placeholder="应用优胜方案、继续验证、扩大 MDE 或停止该方向">${escapeHtml(result.next_action)}</textarea></label>
        </div>
      </section>
    </div>
  </details>`;
}

function renderExperimentPlanResult(project) {
  const record = experimentPlanRecord(project);
  const plan = record?.result;
  if (!plan) {
    return `<section class="card experiment-empty">
      <div><span class="card-label">执行方案 → 学习沉淀</span><h2>建立第一份实验账本</h2><p>生成实验队列、样本门槛和结果记录模板。</p></div>
      <div class="launch-input-summary">
        <div><span>素材简报</span><strong>${project.launch?.pack?.result?.creative_briefs?.length || project.creativePlan?.length || 0}</strong></div>
        <div><span>已有数据</span><strong>${project.data?.metrics ? `${project.data.metrics.period?.activeDays || "—"} 天` : "未导入"}</strong></div>
        <div><span>媒体</span><strong>${escapeHtml(project.platforms.join(" · "))}</strong></div>
        <div><span>最终口径</span><strong>${escapeHtml(project.attribution || "待确认")}</strong></div>
      </div>
    </section>`;
  }

  const summary = experimentPlanSummary(plan);
  const versions = project.experiments?.versions || [];
  const source = runRecordLabel(record);
  return `<div class="experiment-workspace">
    <section class="experiment-hero">
      <div><span class="card-label">${escapeHtml(source)} · ${dateText(record.generatedAt)}</span><h2>${escapeHtml(plan.title)}</h2><p>${escapeHtml(plan.executive_summary)}</p></div>
      <div class="experiment-hero-metrics">
        <p><strong>${summary.total}</strong><span>实验总数</span></p>
        <p><strong>${summary.ready}</strong><span>周期可行</span></p>
        <p><strong>${summary.running}</strong><span>进行中</span></p>
        <p><strong>${summary.learnings}</strong><span>已沉淀学习</span></p>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>学习议程</h2></div><span class="card-label">TEST & LEARN</span></div>
      <div class="learning-agenda">${plan.learning_agenda.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(item)}</p></article>`).join("")}</div>
    </section>

    <section class="experiment-board">
      ${experimentLane(plan, "now")}
      ${experimentLane(plan, "next")}
      ${experimentLane(plan, "later")}
    </section>

    <section class="experiment-detail-stack">
      <div class="section-title"><div><span class="card-label">EXPERIMENT REGISTRY</span><h2>实验设计与结果记录</h2></div></div>
      ${plan.experiments.map(renderExperimentCard).join("")}
    </section>

    <div class="grid grid-2">
      <section class="card"><div class="card-header"><div><h2>实验风险</h2></div><span class="card-label">GUARDRAILS</span></div><div class="launch-risk-list">${plan.risks.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div></section>
      <section class="card version-card"><div class="card-header"><div><h2>实验账本版本</h2><p>在实验开始和结论冻结时分别保存快照</p></div><button class="button button-secondary button-small" data-save-experiment-version>保存当前版本</button></div>${versions.length ? `<div class="version-list">${versions.map((version) => `<div class="version-row"><div><strong>${escapeHtml(version.name)}</strong><span>${dateText(version.savedAt)}</span></div><button class="button button-ghost button-small" data-restore-experiment-version="${attr(version.id)}">恢复</button></div>`).join("")}</div>` : `<p class="muted">还没有保存实验账本快照。</p>`}</section>
    </div>
  </div>`;
}

function renderExperiments(project) {
  const record = experimentPlanRecord(project);
  const actions = record?.result
    ? `<button class="button button-ghost" data-export-experiments>导出文档</button><button class="button button-ghost" data-export-experiment-html>导出网页</button><button class="button button-secondary" data-save-experiment-version>保存版本</button>`
    : "";
  const mode = state.aiMode === "codex" ? routeDetail("experiments") : "本地演示 · 不耗额度";
  return `${pageHeader("阶段 04 · 实验台", "实验台", "", actions)}
    <section class="card experiment-runbar mb-16"><div><strong>本页主操作</strong><span>${escapeHtml(mode)} · 只规划记录，不创建后台实验</span></div><button class="button button-primary" data-run-experiments ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : state.aiMode === "codex" ? "生成实验账本" : "生成演示实验账本"}</button></section>
    ${renderExperimentPlanResult(project)}`;
}

function comparisonRangePanel() {
  if (!importSession?.mapping?.date) {
    return `<div class="comparison-range-panel unavailable"><strong>周期对比</strong><span>映射“日期”字段后，可比较两个独立区间。</span></div>`;
  }
  const ranges = importSession.comparisonRanges;
  if (!ranges) {
    return `<div class="comparison-range-panel unavailable"><strong>周期对比</strong><span>至少需要 2 个有效日期；当前数据仍可计算汇总指标。</span></div>`;
  }
  const controls = [
    ["previousStart", "对比期开始"],
    ["previousEnd", "对比期结束"],
    ["currentStart", "本期开始"],
    ["currentEnd", "本期结束"]
  ];
  return `<div class="comparison-range-panel"><div class="comparison-range-header"><div><strong>周期对比</strong><span>默认取最近两段等量有效日期，可手动调整；区间不得重叠。</span></div><button class="button button-ghost button-small" data-reset-comparison-ranges>恢复默认</button></div><div class="comparison-range-grid">${controls.map(([field, label]) => `<label><span>${label}</span><input type="date" data-comparison-range="${field}" value="${attr(ranges[field])}" /></label>`).join("")}</div></div>`;
}

function mappingPanel() {
  if (!importSession) return "";
  const profiles = normalizeMappingProfiles(state.mappingProfiles);
  const selected = profiles.find((profile) => profile.id === importSession.profileId);
  const compatibility = selected ? mappingProfileCompatibility(selected, importSession.parsed.headers) : null;
  const profileOptions = profiles.map((profile) => {
    const match = mappingProfileCompatibility(profile, importSession.parsed.headers);
    return `<option value="${attr(profile.id)}" ${profile.id === selected?.id ? "selected" : ""}>${escapeHtml(profile.name)} · 匹配 ${match.matched}/${match.total}</option>`;
  }).join("");
  return `<div class="mt-16"><div class="card-header"><div><h3>字段映射 · ${escapeHtml(importSession.name)}</h3><p>已识别 ${importSession.parsed.rows.length} 行；请确认关键字段后计算</p></div><button class="button button-primary button-small" data-apply-import>计算并写入项目</button></div>
    <div class="mapping-profile-bar"><div><label for="mappingProfileSelect">映射模板</label><select id="mappingProfileSelect" class="mapping-select" data-mapping-profile><option value="">不使用模板</option>${profileOptions}</select>${compatibility ? `<small>当前文件匹配 ${compatibility.matched}/${compatibility.total} 个已映射字段</small>` : `<small>保存后可复用于相同媒体或 AppsFlyer 报表</small>`}</div><div class="inline-actions"><button class="button button-ghost button-small" data-apply-mapping-profile ${selected ? "" : "disabled"}>应用模板</button><button class="button button-secondary button-small" data-save-mapping-profile>保存当前映射</button><button class="button button-ghost button-small" data-delete-mapping-profile ${selected ? "" : "disabled"}>删除</button></div></div>
    <div class="mapping-grid">${Object.entries(FIELD_LABELS).map(([field, label]) => `<div class="mapping-item"><label>${escapeHtml(label)}</label><select class="mapping-select" data-map-field="${field}"><option value="">不映射</option>${importSession.parsed.headers.map((header) => `<option value="${attr(header)}" ${importSession.mapping[field] === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></div>`).join("")}</div>${comparisonRangePanel()}</div>`;
}

const COMPARISON_METRIC_UI = {
  spend: { label: "花费", type: "currency" },
  installs: { label: "媒体安装", type: "number" },
  af_installs: { label: "AF 安装", type: "number" },
  cpi: { label: "媒体 CPI", type: "currency" },
  afCpi: { label: "AF-CPI", type: "currency" },
  conversions: { label: "目标转化", type: "number" },
  cpa: { label: "CPA", type: "currency" },
  roas: { label: "ROAS", type: "ratio" }
};

function comparisonValue(value, type, currency) {
  return formatMetric(value, type, currency);
}

function comparisonChange(change) {
  if (!change) return `<span class="comparison-change neutral">—</span>`;
  if (change.trend === "flat") return `<span class="comparison-change neutral">持平</span>`;
  const prefix = change.relativeChange !== null && change.relativeChange > 0 ? "+" : "";
  const label = change.relativeChange === null
    ? "基期为 0"
    : `${prefix}${formatMetric(change.relativeChange, "percent")}`;
  return `<span class="comparison-change ${attr(change.assessment)}">${escapeHtml(label)}</span>`;
}

function periodComparison(project) {
  const comparison = project.data?.comparison;
  if (!comparison) return "";
  const rangeLabel = (range, period) => `${range} · ${period.activeDays} 个有效日期`;
  const previousLabel = `${comparison.ranges.previousStart}–${comparison.ranges.previousEnd}`;
  const currentLabel = `${comparison.ranges.currentStart}–${comparison.ranges.currentEnd}`;
  if (!comparison.available) {
    return `<section class="card mb-16"><div class="card-header"><div><h2>周期对比</h2><p>${escapeHtml(comparison.reason || "当前区间无法比较")}</p></div></div></section>`;
  }
  const metrics = (comparison.availableMetrics || []).filter((metric) => COMPARISON_METRIC_UI[metric]);
  return `<section class="card comparison-card mb-16"><div class="card-header"><div><h2>周期对比</h2><p>代码按相同指标口径计算相对变化；花费与量级只显示变化，不判定好坏。</p></div><span class="card-label">${escapeHtml(currentLabel)}</span></div><div class="comparison-periods"><span>对比期 · ${escapeHtml(rangeLabel(previousLabel, comparison.previous.period))}</span><span>本期 · ${escapeHtml(rangeLabel(currentLabel, comparison.current.period))}</span></div><div class="table-wrap"><table><thead><tr><th>指标</th><th>对比期</th><th>本期</th><th>相对变化</th></tr></thead><tbody>${metrics.map((metric) => {
    const definition = COMPARISON_METRIC_UI[metric];
    return `<tr><td><strong>${escapeHtml(definition.label)}</strong></td><td>${comparisonValue(comparison.previous.summary[metric], definition.type, project.currency)}</td><td>${comparisonValue(comparison.current.summary[metric], definition.type, project.currency)}</td><td>${comparisonChange(comparison.changes[metric])}</td></tr>`;
  }).join("")}</tbody></table></div></section>`;
}

const OPTIMIZATION_STATUS_LABELS = {
  pending: "待复核",
  accepted: "已采纳",
  executing: "执行中",
  validated: "已验证",
  rejected: "不采纳"
};

function optimizationStatusText(status) {
  return OPTIMIZATION_STATUS_LABELS[status] || "待复核";
}

function optimizationPeriodText(run) {
  const ranges = run.dataContext?.comparisonRanges;
  if (ranges?.currentStart && ranges?.currentEnd) {
    return `本期 ${ranges.currentStart}–${ranges.currentEnd} · 对比 ${ranges.previousStart}–${ranges.previousEnd}`;
  }
  const period = run.dataContext?.period;
  if (period?.startDate && period?.endDate) return `数据期 ${period.startDate}–${period.endDate}`;
  return "未记录日期区间";
}

function optimizationSnapshot(run, currency) {
  const fields = new Set(run.dataContext?.availableFields || []);
  const summary = run.dataContext?.summary || {};
  const values = [
    ["花费", fields.has("spend") ? formatMetric(summary.spend, "currency", currency) : "—"],
    ["媒体安装", fields.has("installs") ? formatMetric(summary.installs) : "—"],
    ["AF 安装", fields.has("af_installs") ? formatMetric(summary.af_installs) : "—"],
    ["AF-CPI", fields.has("spend") && fields.has("af_installs") ? formatMetric(summary.afCpi, "currency", currency) : "—"],
    ["CPA", fields.has("spend") && fields.has("conversions") ? formatMetric(summary.cpa, "currency", currency) : "—"],
    ["ROAS", fields.has("spend") && fields.has("revenue") ? formatMetric(summary.roas, "ratio") : "—"]
  ];
  return `<div class="optimization-snapshot">${values.map(([label, value]) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>`;
}

function optimizationHistoryPanel(project) {
  const runs = projectOptimizationHistory(project);
  return `<section class="card optimization-history-card">
    <div class="card-header"><div><h2>优化决策记录</h2><p>保留每次诊断的数据口径、模型建议与人工结论。</p></div><span class="card-label">${runs.length} 次诊断</span></div>
    ${runs.length ? `<div class="optimization-history">${runs.map((run, index) => `<details class="optimization-run">
      <summary><div><span>诊断 ${String(runs.length - index).padStart(2, "0")}</span><strong>${escapeHtml(dateTimeText(run.generatedAt))}</strong><small>${escapeHtml(run.dataContext?.sourceFile || "未记录数据文件")}</small></div><p>${escapeHtml(run.result?.executive_summary || "无诊断摘要")}</p><em class="optimization-status ${attr(run.status)}">${escapeHtml(optimizationStatusText(run.status))}</em></summary>
      <div class="optimization-run-body">
        <div class="optimization-run-meta"><span>${escapeHtml(runRecordLabel(run))}</span><span>${escapeHtml(optimizationPeriodText(run))}</span></div>
        ${optimizationSnapshot(run, project.currency || "USD")}
        <div class="optimization-review-grid" data-optimization-review="${attr(run.id)}"><label><span>人工状态</span><select data-optimization-run-status>${OPTIMIZATION_RUN_STATUSES.map((status) => `<option value="${status}" ${run.status === status ? "selected" : ""}>${escapeHtml(optimizationStatusText(status))}</option>`).join("")}</select></label><label><span>人工结论</span><textarea data-optimization-run-note placeholder="记录采纳或不采纳原因、执行结果与后续验证。">${escapeHtml(run.note)}</textarea></label><button class="button button-secondary button-small" type="button" data-save-optimization-review="${attr(run.id)}">保存人工复核</button></div>
        <div class="optimization-run-content"><div><h3>诊断摘要</h3><p>${escapeHtml(run.result?.executive_summary || "无")}</p></div><div><h3>建议动作</h3><ol>${(run.result?.next_actions || []).map((action) => `<li><strong>${escapeHtml(action.action)}</strong><span>${escapeHtml(action.owner)} · ${escapeHtml(action.timing)} · ${escapeHtml(action.success_metric)}</span></li>`).join("") || "<li>无结构化动作</li>"}</ol></div></div>
      </div>
    </details>`).join("")}</div>` : `<p class="muted">运行一次投放优化诊断后，记录会自动出现在这里。</p>`}
  </section>`;
}

function optimizationDecisionTable(project, limit = 5) {
  const runs = projectOptimizationHistory(project).slice(0, limit);
  if (!runs.length) return `<p class="muted">还没有优化决策记录。</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>诊断时间</th><th>数据与周期</th><th>状态</th><th>人工结论</th></tr></thead><tbody>${runs.map((run) => `<tr><td>${escapeHtml(dateTimeText(run.generatedAt))}</td><td class="cell-wrap"><strong>${escapeHtml(run.dataContext?.sourceFile || "未记录")}</strong><small>${escapeHtml(optimizationPeriodText(run))}</small></td><td><span class="optimization-status ${attr(run.status)}">${escapeHtml(optimizationStatusText(run.status))}</span></td><td class="cell-wrap">${escapeHtml(run.note || "待补充")}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderOptimize(project) {
  return `${pageHeader("阶段 05 · 投放优化", "投放优化", "上传 CSV，由代码计算指标，AI 基于证据判断。")}
    <section class="card mb-16">
      <div class="card-header"><div><h2>数据导入</h2><p>V1 支持 CSV；原始明细仅在当前页面解析，项目只保存聚合指标</p></div>${project.data ? `<span class="badge" style="color:var(--success);background:var(--success-soft)">${escapeHtml(project.data.fileName)}</span>` : ""}</div>
      <div class="drop-zone"><strong>导入媒体 / AppsFlyer 报表</strong><span>支持带引号的 CSV；可手动调整字段映射</span><div class="upload-actions" style="justify-content:center"><label class="button button-secondary">选择 CSV<input id="csvInput" type="file" accept=".csv,text/csv" /></label><button class="button button-ghost" data-load-demo>载入演示 CSV</button></div></div>
      ${mappingPanel()}
    </section>
    ${metricCards(project)}
    ${periodComparison(project)}
    <div class="grid grid-2 mb-16"><section class="card"><div class="card-header"><div><h2>媒体对比</h2></div></div>${platformTable(project)}</section><section class="card"><div class="card-header"><div><h2>国家效率</h2><p>横条为花费，右侧优先显示 AF-CPI；缺失时显示媒体 CPI</p></div></div>${spendBars(project)}</section></div>
    <section class="card mb-16">${analysisToolbar("optimize")}${aiResult(project, "optimize")}</section>
    ${optimizationHistoryPanel(project)}`;
}

function latestAnalysis(project) {
  return project.ai?.optimize || project.ai?.strategy || project.ai?.creative || null;
}

function experimentLearningTable(project) {
  const experiments = project.experiments?.plan?.result?.experiments || [];
  if (!experiments.length) return `<p class="muted">还没有实验账本。</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>实验</th><th>状态</th><th>可行性</th><th>结果</th><th>学习 / 下一步</th></tr></thead><tbody>${experiments.map((item) => `<tr><td class="cell-wrap"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.platform)} · ${escapeHtml(item.design.single_variable)}</small></td><td>${escapeHtml(experimentStatusText(item.status))}</td><td>${escapeHtml(feasibilityText(item.feasibility.status))}${item.feasibility.estimated_duration_days ? `<small>${item.feasibility.estimated_duration_days} 天</small>` : ""}</td><td>${escapeHtml(experimentOutcomeText(item.result.outcome))}${item.result.relative_change_percent === null ? "" : `<small>${item.result.relative_change_percent}%</small>`}</td><td class="cell-wrap">${escapeHtml(item.result.learning || item.result.next_action || "等待实验结果")}</td></tr>`).join("")}</tbody></table></div>`;
}

function actionTable(result) {
  if (!result?.next_actions?.length) return `<p class="muted">运行分析后生成下一步动作。</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>动作</th><th>负责人</th><th>时间</th><th>成功指标</th></tr></thead><tbody>${result.next_actions.map((item) => `<tr><td class="cell-wrap"><strong>${escapeHtml(item.action)}</strong></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.timing)}</td><td class="cell-wrap">${escapeHtml(item.success_metric)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderReport(project) {
  const record = latestAnalysis(project);
  const result = record?.result;
  const summary = project.data?.metrics?.summary || {};
  const actions = `<button class="button button-secondary" data-export-report>导出网页</button><button class="button button-primary" data-print-report>打印或导出 PDF</button>`;
  return `${pageHeader("报告中心", "报告输出", "", actions)}
    <article class="report-preview">
      <div class="report-cover"><div><p class="eyebrow">OVERSEAS APP UA · PERFORMANCE REVIEW</p><h2>${escapeHtml(project.name)}<br />投放阶段复盘与下一步计划</h2></div><div class="report-meta">${escapeHtml(project.industry)} App · ${escapeHtml(project.platforms.join(" / "))}<br />${escapeHtml(project.markets || "市场待设置")} · ${dateText(new Date().toISOString())}<br />${project.isDemo ? "演示数据，不代表真实客户表现" : "OpenAdOps 本地工作台生成"}</div></div>
      <section class="report-section"><h3>01 · 核心指标</h3>${metricCards(project)}</section>
      <section class="report-section"><h3>02 · 管理层摘要</h3><div class="summary-callout">${escapeHtml(result?.executive_summary || "尚未生成结构化分析。建议先在“投放优化”导入数据并运行分析。")}</div></section>
      <section class="report-section"><h3>03 · 关键判断</h3>${result ? result.findings.map((item) => `<article class="finding-card"><div class="finding-top"><h3>${escapeHtml(item.title)}</h3><span class="priority-badge ${attr(item.priority)}">${priorityText(item.priority)}</span></div><div class="finding-body"><div class="evidence-box"><span>证据</span><p>${escapeHtml(item.evidence)}</p></div><div class="action-box"><span>动作</span><p>${escapeHtml(item.action)}</p></div></div><p class="finding-diagnosis">${escapeHtml(item.diagnosis)} · 验证：${escapeHtml(item.validation)}</p></article>`).join("") : emptyState("还没有关键判断", "生成失败时不会写入假结果；请在其他阶段重新运行。", "optimize", "去优化页")}</section>
      <section class="report-section"><h3>04 · 实验与学习</h3>${experimentLearningTable(project)}</section>
      <section class="report-section"><h3>05 · 下一步动作</h3>${actionTable(result)}</section>
      <section class="report-section"><h3>06 · 优化决策记录</h3>${optimizationDecisionTable(project)}</section>
      <section class="report-section"><h3>07 · 口径说明</h3><div class="project-facts"><div class="fact-row"><span>数据来源</span><strong>${escapeHtml(project.data?.fileName || "未导入")}</strong></div><div class="fact-row"><span>归因口径</span><strong>${escapeHtml(project.attribution)}</strong></div><div class="fact-row"><span>分析来源</span><strong>${record ? escapeHtml(runRecordLabel(record)) : "未运行"}</strong></div><div class="fact-row"><span>项目备注</span><strong>${escapeHtml(project.notes || "无")}</strong></div></div></section>
    </article>`;
}

const renderers = { overview: renderOverview, intake: renderIntake, strategy: renderStrategy, creative: renderCreative, launch: renderLaunch, experiments: renderExperiments, optimize: renderOptimize, report: renderReport };

function refreshShell(project) {
  projectSelect.innerHTML = state.projects.map((item) => `<option value="${attr(item.id)}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  projectSelect.disabled = aiBusy;
  if (aiModeSelect) {
    aiModeSelect.value = state.aiMode;
    aiModeSelect.disabled = aiBusy;
  }
  document.querySelectorAll("[data-ai-mode]").forEach((button) => {
    const active = button.dataset.aiMode === state.aiMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.disabled = aiBusy || (isStaticDemo && button.dataset.aiMode === "codex");
    if (isStaticDemo && button.dataset.aiMode === "codex") {
      button.title = "请在本地启动后使用 GPT-5.6";
    }
  });
  newProjectButton.disabled = aiBusy;
  if (importWorkspaceButton) importWorkspaceButton.disabled = aiBusy;
  demoBadge.hidden = !project.isDemo;
  if (versionBadge) versionBadge.textContent = `v${APP_VERSION}`;
  document.querySelectorAll("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === route()));
}

function render() {
  const project = activeProject();
  if (!project) return;
  refreshShell(project);
  app.innerHTML = renderers[route()](project);
  attachPageListeners();
}

function attachPageListeners() {
  document.querySelectorAll("[data-intake-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        if (!project.intake) project.intake = createIntake();
        project.intake[input.dataset.intakeField] = input.value;
      });
      if (saved) showToast("原始资料已保存");
    });
  });
  document.querySelectorAll("[data-brief-key]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const field = project.intake?.analysis?.result?.brief_fields?.find((item) => item.key === input.dataset.briefKey);
        if (!field) return;
        field.value = input.value.trim();
        field.status = field.value ? "confirmed" : "missing";
        field.source = field.value ? "operator_notes" : "unknown";
        field.evidence = field.value ? "优化师在结构化简报 中手动确认" : "优化师清空该字段，需要重新补充";
        if (field.value) {
          project.intake.analysis.result.clarification_questions = project.intake.analysis.result.clarification_questions.filter((item) => item.field_key !== field.key);
        }
      });
      render();
      if (saved) showToast("简报字段已确认");
    });
  });
  document.querySelectorAll("[data-project-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.type === "number" ? Number(input.value) : input.value;
      const saved = updateProject((project) => setNested(project, input.dataset.projectField, value));
      if (saved) showToast("项目已保存");
    });
  });
  document.querySelector("[data-add-performance-target]")?.addEventListener("click", () => {
    const current = normalizePerformanceTargets(activeProject(), { makeId });
    const metric = nextPerformanceTargetMetric(activeProject(), current);
    if (!metric) {
      showToast("可添加的衡量指标已全部使用", "error");
      return;
    }
    const saved = updateProject((project) => {
      const targets = normalizePerformanceTargets(project, { makeId });
      targets.push({
        id: makeId(),
        metric,
        status: "observe",
        value: null,
        event: "",
        window: "",
        primary: targets.length === 0
      });
      project.performanceTargets = normalizePerformanceTargets({ ...project, performanceTargets: targets }, { makeId });
    });
    render();
    if (saved) showToast("已添加衡量指标，默认仅观察");
  });
  document.querySelectorAll("[data-target-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const targets = normalizePerformanceTargets(project, { makeId });
        const target = targets.find((item) => item.id === input.dataset.targetId);
        if (!target) return;
        const field = input.dataset.targetField;
        target[field] = field === "value" ? (input.value === "" ? null : Number(input.value)) : input.value;
        if (field === "status" && input.value === "observe") target.value = null;
        if (field === "metric" && input.value !== "cpa") target.event = "";
        if (field === "metric" && input.value !== "roas") target.window = "";
        project.performanceTargets = normalizePerformanceTargets({ ...project, performanceTargets: targets }, { makeId });
      });
      render();
      if (saved) showToast("衡量指标已更新");
    });
  });
  document.querySelectorAll("[data-target-primary]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const targets = normalizePerformanceTargets(project, { makeId });
        targets.forEach((target) => { target.primary = target.id === input.dataset.targetPrimary; });
        project.performanceTargets = targets;
      });
      render();
      if (saved) showToast("主要指标已更新");
    });
  });
  document.querySelectorAll("[data-remove-performance-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const saved = updateProject((project) => {
        const targets = normalizePerformanceTargets(project, { makeId }).filter((target) => target.id !== button.dataset.removePerformanceTarget);
        if (targets.length && !targets.some((target) => target.primary)) targets[0].primary = true;
        project.performanceTargets = targets;
      });
      render();
      if (saved) showToast("衡量指标已删除");
    });
  });
  document.querySelectorAll("[data-budget-platform]").forEach((input) => {
    input.addEventListener("change", () => {
      updateProject((project) => {
        if (!project.strategy) project.strategy = {};
        if (!project.strategy.budgetShares) project.strategy.budgetShares = {};
        project.strategy.budgetShares[input.dataset.budgetPlatform] = Number(input.value);
      });
      render();
    });
  });
  document.querySelectorAll("[data-creative-task-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const production = syncCreativeProduction(project);
        const task = production.tasks.find((item) => item.id === input.dataset.creativeTaskId);
        if (!task) return;
        const field = input.dataset.creativeTaskField;
        task[field] = field === "quantity" ? Math.max(1, Number(input.value) || 1) : input.value;
        task.updatedAt = new Date().toISOString();
        syncCreativeProduction(project, production.tasks);
      });
      render();
      if (saved) showToast("素材任务已更新");
    });
  });
  document.querySelector("[data-add-creative-task]")?.addEventListener("click", () => {
    const saved = updateProject((project) => {
      const production = syncCreativeProduction(project);
      production.tasks.push(normalizeCreativeTask({
        source: "manual",
        platform: project.platforms?.[0],
        market: project.markets,
        deliverable: "视频",
        quantity: 1,
        owner: "待分配",
        status: "backlog"
      }, {
        makeId,
        now: new Date().toISOString(),
        defaultPlatform: project.platforms?.[0],
        defaultMarket: project.markets
      }));
      syncCreativeProduction(project, production.tasks);
    });
    render();
    if (saved) showToast("已新建素材任务");
  });
  document.querySelectorAll("[data-remove-creative-task]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("删除这条素材任务？此操作会立即保存。")) return;
      const saved = updateProject((project) => {
        const production = syncCreativeProduction(project);
        syncCreativeProduction(project, production.tasks.filter((task) => task.id !== button.dataset.removeCreativeTask));
      });
      render();
      if (saved) showToast("素材任务已删除");
    });
  });
  document.querySelector("[data-export-creative-csv]")?.addEventListener("click", exportCreativeProductionCsv);
  document.querySelector("[data-export-creative-markdown]")?.addEventListener("click", exportCreativeProductionMarkdown);
  document.querySelectorAll("[data-launch-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const pack = project.launch?.pack?.result;
        const item = pack?.launch_checklist?.find((entry) => entry.id === select.dataset.launchStatus);
        if (!item) return;
        item.status = select.value;
        if (select.value === "ready") {
          const stamp = "优化师已人工确认";
          const evidence = String(item.evidence || "").trim();
          if (!evidence.includes(stamp)) {
            item.evidence = evidence ? `${evidence}；${stamp}` : stamp;
          }
        }
        recalculateLaunchReadiness(pack, true);
      });
      render();
      if (saved) showToast("上线检查项状态已更新");
    });
  });
  document.querySelectorAll("[data-experiment-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const experiment = activeProject().experiments?.plan?.result?.experiments?.find((item) => item.id === input.dataset.experimentId);
      if (!experiment) return;
      const field = input.dataset.experimentField;
      const value = input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
      const sizingError = experimentSizingInputError(field, value);
      if (sizingError) {
        input.value = nullableValue(field.split(".").reduce((current, key) => current?.[key], experiment));
        showToast(sizingError, "error");
        return;
      }
      if (field === "status" && value === "concluded") {
        if (!experimentConclusionComplete(experiment)) {
          input.value = experiment.status;
          showToast("结束实验前，请先填写结论、证据、学习和下一步动作。", "error");
          return;
        }
      }
      let reopened = false;
      const saved = updateProject((project) => {
        const plan = project.experiments?.plan?.result;
        const target = plan?.experiments?.find((item) => item.id === input.dataset.experimentId);
        if (!target) return;
        setNested(target, field, value);
        if (field.startsWith("result.") && target.status === "concluded" && !experimentConclusionComplete(target)) {
          target.status = "running";
          reopened = true;
        }
        project.experiments.plan.result = enrichExperimentPlan(plan);
      });
      render();
      if (saved) showToast(
        reopened
          ? "结论资料不完整，实验已恢复为“进行中”。"
          : field.startsWith("design.")
            ? "样本与周期已重新计算"
            : "实验账本已更新",
        reopened ? "error" : "success"
      );
    });
  });
  document.querySelectorAll("[data-save-optimization-review]").forEach((button) => {
    button.addEventListener("click", () => {
      const review = button.closest("[data-optimization-review]");
      if (!review) return;
      saveOptimizationReview(button.dataset.saveOptimizationReview, {
        status: review.querySelector("[data-optimization-run-status]")?.value,
        note: review.querySelector("[data-optimization-run-note]")?.value || ""
      });
    });
  });
  document.querySelectorAll("[data-go-route]").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.goRoute; }));
  document.querySelectorAll("[data-scroll-experiment]").forEach((button) => button.addEventListener("click", () => {
    const target = document.querySelector(`#experiment-${CSS.escape(button.dataset.scrollExperiment)}`);
    if (!target) return;
    target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelectorAll("[data-run-ai]").forEach((button) => button.addEventListener("click", () => runAnalysis(button.dataset.runAi)));
  document.querySelectorAll("[data-run-intake]").forEach((button) => button.addEventListener("click", () => runIntake(button.dataset.runIntake)));
  document.querySelector("[data-run-launch-pack]")?.addEventListener("click", runLaunchPack);
  document.querySelector("[data-run-experiments]")?.addEventListener("click", runExperimentPlan);
  document.querySelectorAll("[data-save-intake-version]").forEach((button) => button.addEventListener("click", saveIntakeVersion));
  document.querySelectorAll("[data-restore-intake-version]").forEach((button) => button.addEventListener("click", () => restoreIntakeVersion(button.dataset.restoreIntakeVersion)));
  document.querySelector("[data-export-intake]")?.addEventListener("click", exportIntakeMarkdown);
  document.querySelector("[data-adopt-intake]")?.addEventListener("click", adoptIntakeStrategy);
  document.querySelector("[data-copy-questions]")?.addEventListener("click", copyClarificationQuestions);
  document.querySelectorAll("[data-save-launch-version]").forEach((button) => button.addEventListener("click", saveLaunchVersion));
  document.querySelectorAll("[data-restore-launch-version]").forEach((button) => button.addEventListener("click", () => restoreLaunchVersion(button.dataset.restoreLaunchVersion)));
  document.querySelector("[data-export-launch-pack]")?.addEventListener("click", exportLaunchPackMarkdown);
  document.querySelector("[data-export-launch-html]")?.addEventListener("click", exportLaunchPackHtml);
  document.querySelectorAll("[data-save-experiment-version]").forEach((button) => button.addEventListener("click", saveExperimentVersion));
  document.querySelectorAll("[data-restore-experiment-version]").forEach((button) => button.addEventListener("click", () => restoreExperimentVersion(button.dataset.restoreExperimentVersion)));
  document.querySelector("[data-export-experiments]")?.addEventListener("click", exportExperimentMarkdown);
  document.querySelector("[data-export-experiment-html]")?.addEventListener("click", exportExperimentHtml);
  document.querySelectorAll("[data-map-field]").forEach((select) => select.addEventListener("change", () => {
    importSession.mapping[select.dataset.mapField] = select.value;
    if (select.dataset.mapField === "date") {
      resetImportComparisonRanges();
      render();
    }
  }));
  document.querySelector("[data-mapping-profile]")?.addEventListener("change", (event) => {
    importSession.profileId = event.target.value;
    render();
  });
  document.querySelector("[data-apply-mapping-profile]")?.addEventListener("click", applySelectedMappingProfile);
  document.querySelector("[data-save-mapping-profile]")?.addEventListener("click", saveCurrentMappingProfile);
  document.querySelector("[data-delete-mapping-profile]")?.addEventListener("click", deleteSelectedMappingProfile);
  document.querySelectorAll("[data-comparison-range]").forEach((input) => input.addEventListener("change", () => {
    if (importSession?.comparisonRanges) importSession.comparisonRanges[input.dataset.comparisonRange] = input.value;
  }));
  document.querySelector("[data-reset-comparison-ranges]")?.addEventListener("click", () => {
    resetImportComparisonRanges();
    render();
  });
  document.querySelector("[data-apply-import]")?.addEventListener("click", applyImport);
  document.querySelector("[data-load-demo]")?.addEventListener("click", () => prepareImport("openadops-demo.csv", DEMO_CSV, true));
  document.querySelector("#csvInput")?.addEventListener("change", handleFileInput);
  document.querySelector("[data-export-report]")?.addEventListener("click", exportReport);
  document.querySelector("[data-print-report]")?.addEventListener("click", () => window.print());
}

async function handleFileInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showToast("V1 暂只支持 CSV，请先从 Excel 导出 CSV。", "error");
    return;
  }
  try {
    prepareImport(file.name, await file.text(), false);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function prepareImport(name, text, isDemo) {
  try {
    const parsed = parseCsv(text);
    const suggested = suggestMappingProfile(state.mappingProfiles, parsed.headers);
    const applied = suggested ? applyMappingProfile(suggested, parsed.headers) : null;
    const autoApplied = applied?.compatibility.total > 0 && applied.compatibility.ratio === 1;
    const mapping = autoApplied ? applied.mapping : detectMapping(parsed.headers);
    importSession = {
      name,
      parsed,
      mapping,
      profileId: suggested?.id || "",
      comparisonRanges: mapping.date ? defaultComparisonRanges(mapRows(parsed.rows, mapping)) : null,
      isDemo
    };
    render();
    showToast(autoApplied
      ? `已读取 ${parsed.rows.length} 行，并套用映射模板「${suggested.name}」`
      : `已读取 ${parsed.rows.length} 行，请确认字段映射`);
  } catch (error) {
    showToast(`CSV 读取失败：${error.message}`, "error");
  }
}

function resetImportComparisonRanges() {
  if (!importSession?.mapping?.date) {
    if (importSession) importSession.comparisonRanges = null;
    return;
  }
  importSession.comparisonRanges = defaultComparisonRanges(
    mapRows(importSession.parsed.rows, importSession.mapping)
  );
}

function applySelectedMappingProfile() {
  if (!importSession?.profileId) return;
  const profile = normalizeMappingProfiles(state.mappingProfiles).find((item) => item.id === importSession.profileId);
  if (!profile) {
    showToast("映射模板不存在", "error");
    return;
  }
  const { mapping, compatibility } = applyMappingProfile(profile, importSession.parsed.headers);
  importSession.mapping = mapping;
  resetImportComparisonRanges();
  render();
  showToast(`已应用「${profile.name}」，匹配 ${compatibility.matched}/${compatibility.total} 个字段`);
}

function saveCurrentMappingProfile() {
  if (!importSession) return;
  const selected = normalizeMappingProfiles(state.mappingProfiles).find((item) => item.id === importSession.profileId);
  const fallbackName = selected?.name || importSession.name.replace(/\.csv$/i, "").slice(0, 40) || "报表映射";
  const name = window.prompt("映射模板名称", fallbackName)?.trim();
  if (!name) return;
  try {
    const result = upsertMappingProfile(state.mappingProfiles, {
      id: selected?.id,
      name,
      mapping: importSession.mapping,
      headers: importSession.parsed.headers
    }, { makeId });
    if (!commitState({ ...state, mappingProfiles: result.profiles })) return;
    importSession.profileId = result.profile.id;
    render();
    showToast(`已保存映射模板「${result.profile.name}」`);
  } catch (error) {
    showToast(`保存失败：${error.message}`, "error");
  }
}

function deleteSelectedMappingProfile() {
  if (!importSession?.profileId) return;
  const profile = normalizeMappingProfiles(state.mappingProfiles).find((item) => item.id === importSession.profileId);
  if (!profile || !window.confirm(`删除映射模板「${profile.name}」？`)) return;
  if (!commitState({ ...state, mappingProfiles: removeMappingProfile(state.mappingProfiles, profile.id) })) return;
  importSession.profileId = "";
  render();
  showToast(`已删除映射模板「${profile.name}」`);
}

function applyImport() {
  if (!importSession) return;
  const mapping = importSession.mapping;
  if (!mapping.spend || (!mapping.installs && !mapping.af_installs)) {
    showToast("至少需要映射花费，以及媒体安装或 AF 安装。", "error");
    return;
  }
  try {
    const mappedRows = mapRows(importSession.parsed.rows, mapping);
    const metrics = calculateMetrics(mappedRows);
    const availableFields = Object.keys(mapping).filter((field) => mapping[field]);
    const comparison = mapping.date && importSession.comparisonRanges
      ? calculatePeriodComparison(mappedRows, importSession.comparisonRanges, { availableFields })
      : null;
    const saved = updateProject((project) => {
      project.data = {
        fileName: importSession.name,
        importedAt: new Date().toISOString(),
        metrics,
        comparison,
        availableFields,
        isDemo: importSession.isDemo
      };
      if (!importSession.isDemo) project.isDemo = false;
    });
    if (!saved) return;
    importSession = null;
    render();
    showToast("数据已计算并写入项目");
  } catch (error) {
    showToast(`计算失败：${error.message}`, "error");
  }
}

function metricsForAi(project) {
  const metrics = project.data?.metrics;
  if (!metrics) return { status: "no_data" };
  return {
    rowCount: metrics.rowCount,
    summary: metrics.summary,
    period: metrics.period,
    byPlatform: metrics.byPlatform.slice(0, 10),
    byCountry: metrics.byCountry.slice(0, 12),
    byCampaign: metrics.byCampaign.slice(0, 12),
    comparison: project.data.comparison || null,
    sourceFile: project.data.fileName,
    importedAt: project.data.importedAt,
    dataNotice: project.data.isDemo ? "演示数据" : "用户导入聚合数据"
  };
}

function aiRecordMeta(payload) {
  return {
    source: payload.source,
    model: payload.model,
    reasoningEffort: payload.reasoningEffort || "",
    durationMs: Number(payload.durationMs || 0),
    fallbackUsed: Boolean(payload.fallbackUsed),
    routeKey: payload.routeKey || ""
  };
}

function completionMessage(label, payload) {
  if (payload.source !== "codex") return label;
  const details = [modelFullName(payload.model)];
  if (payload.reasoningEffort) details.push(`推理：${effortLabel(payload.reasoningEffort)}`);
  if (payload.durationMs) details.push(formatDuration(payload.durationMs));
  if (payload.fallbackUsed) details.push("已自动复核");
  return `${label} · ${details.join(" · ")}`;
}

async function runAnalysis(stage) {
  if (aiBusy) return;
  const project = activeProject();
  const projectId = project.id;
  aiBusy = true;
  if (state.aiMode === "codex") beginAiJob(stage === "optimize" ? "optimizeAnalysis" : "analysis");
  render();
  try {
    let payload;
    if (state.aiMode === "mock") {
      payload = {
        ok: true,
        source: "mock",
        model: "browser-local-mock",
        result: buildMockAnalysis(project, metricsForAi(project))
      };
    } else {
      payload = await requestJson("./api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, stage, project, metrics: metricsForAi(project) })
      });
    }
    const saved = updateProjectById(projectId, (target) => {
      if (!target.ai) target.ai = {};
      const record = {
        ...aiRecordMeta(payload),
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
      target.ai[stage] = record;
      if (stage === "optimize") {
        target.optimizationHistory = appendOptimizationRun(
          target.optimizationHistory,
          record,
          target.data || {},
          { makeId }
        );
      }
      if (stage === "creative" && payload.result.creative_tests?.length) {
        const current = syncCreativeProduction(target).tasks;
        const generated = tasksFromCreativeTests(payload.result.creative_tests, target, {
          makeId,
          now: new Date().toISOString(),
          source: "analysis"
        });
        syncCreativeProduction(target, replaceGeneratedCreativeTasks(current, generated, "analysis", {
          makeId,
          now: new Date().toISOString(),
          defaultPlatform: target.platforms?.[0],
          defaultMarket: target.markets
        }));
      }
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage(payload.source === "codex" ? "分析完成" : "演示结果已生成", payload));
  } catch (error) {
    handleAiFailure(error);
  } finally {
    finishAiJob();
    aiBusy = false;
    render();
  }
}

function saveOptimizationReview(runId, patch) {
  try {
    const saved = updateProject((project) => {
      project.optimizationHistory = updateOptimizationRun(projectOptimizationHistory(project), runId, patch);
    });
    render();
    if (saved) showToast("人工复核已保存");
  } catch (error) {
    showToast(`更新失败：${error.message}`, "error");
  }
}

async function runIntake(action) {
  if (aiBusy) return;
  const project = activeProject();
  const projectId = project.id;
  const intake = project.intake || createIntake();
  const intent = action === "questions" ? "questions" : "strategy";
  const profile = action === "deep" ? "deep" : "fast";
  const routeKey = action === "questions" ? "intakeQuestions" : action === "deep" ? "intakeDeep" : "intakeStrategy";
  if (![intake.rawOffer, intake.clientStrategy, intake.operatorNotes].some((value) => String(value || "").trim())) {
    showToast("请至少粘贴一段客户资料或自己的补充说明。", "error");
    return;
  }
  aiBusy = true;
  if (state.aiMode === "codex") beginAiJob(routeKey);
  render();
  try {
    let payload;
    if (state.aiMode === "mock") {
      payload = {
        ok: true,
        source: "mock",
        model: "browser-local-mock",
        result: buildMockIntake(project, intake, intent)
      };
    } else {
      payload = await requestJson("./api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, intent, profile, project, intake })
      });
    }
    const saved = updateProjectById(projectId, (target) => {
      if (!target.intake) target.intake = createIntake();
      target.intake.analysis = {
        ...aiRecordMeta(payload),
        intent,
        profile,
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    const label = intent === "questions" ? "客户追问清单已生成" : action === "deep" ? "策略初稿深度复核完成" : "策略初稿已生成";
    showToast(completionMessage(label, payload));
  } catch (error) {
    handleAiFailure(error);
  } finally {
    finishAiJob();
    aiBusy = false;
    render();
  }
}

function recalculateLaunchReadiness(pack, updateSummary = false) {
  if (!pack?.launch_checklist?.length) return;
  const blockers = pack.launch_checklist.filter((item) => item.status === "blocker").map((item) => item.item);
  const readyCount = pack.launch_checklist.filter((item) => item.status === "ready").length;
  pack.readiness = {
    score: Math.round((readyCount / pack.launch_checklist.length) * 100),
    status: blockers.length ? "blocked" : pack.launch_checklist.some((item) => item.status === "needs_confirmation") ? "conditional" : "ready",
    blockers
  };
  if (updateSummary) {
    pack.executive_summary = `上线检查项已由优化师更新：当前就绪度 ${pack.readiness.score}%，${blockers.length ? `存在 ${blockers.length} 个阻塞项，正式花费前必须关闭。` : pack.readiness.status === "conditional" ? "没有硬阻塞项，但仍有待确认事项。" : "所有检查项已标记为可上线，仍建议由项目负责人做最终复核。"}`;
  }
}

async function runLaunchPack() {
  if (aiBusy) return;
  const project = activeProject();
  const projectId = project.id;
  if (!project.intake?.analysis?.result && !project.strategy?.objective) {
    showToast("建议先整理客户资料或完善策略初稿，再生成投放执行方案。", "error");
    return;
  }
  aiBusy = true;
  if (state.aiMode === "codex") beginAiJob("launchPack");
  render();
  try {
    let payload;
    if (state.aiMode === "mock") {
      payload = {
        ok: true,
        source: "mock",
        model: "browser-local-mock",
        result: buildMockLaunchPack(project, project.intake?.analysis?.result || null)
      };
    } else {
      payload = await requestJson("./api/launch-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, project, intake: project.intake || createIntake() })
      });
    }
    const saved = updateProjectById(projectId, (target) => {
      if (!target.launch) target.launch = createLaunch();
      target.launch.pack = {
        ...aiRecordMeta(payload),
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
      target.launch.checklist = Object.fromEntries(payload.result.launch_checklist.map((item) => [item.id, item.status === "ready"]));
      const current = syncCreativeProduction(target).tasks;
      const generated = tasksFromCreativeBriefs(payload.result.creative_briefs, target, {
        makeId,
        now: new Date().toISOString()
      });
      syncCreativeProduction(target, replaceGeneratedCreativeTasks(current, generated, "launch_pack", {
        makeId,
        now: new Date().toISOString(),
        defaultPlatform: target.platforms?.[0],
        defaultMarket: target.markets
      }));
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage("投放执行方案已生成", payload));
  } catch (error) {
    handleAiFailure(error);
  } finally {
    finishAiJob();
    aiBusy = false;
    render();
  }
}

async function runExperimentPlan() {
  if (aiBusy) return;
  const project = activeProject();
  const projectId = project.id;
  const launchPack = project.launch?.pack?.result || null;
  if (!launchPack && !project.creativePlan?.length) {
    showToast("请先生成投放执行方案或至少准备一份素材生产任务。", "error");
    return;
  }
  aiBusy = true;
  if (state.aiMode === "codex") beginAiJob("experiments");
  render();
  try {
    let payload;
    if (state.aiMode === "mock") {
      payload = {
        ok: true,
        source: "mock",
        model: "browser-local-mock",
        result: buildMockExperimentPlan(project, launchPack)
      };
    } else {
      payload = await requestJson("./api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, project, launchPack, metrics: metricsForAi(project) })
      });
    }
    const saved = updateProjectById(projectId, (target) => {
      if (!target.experiments) target.experiments = createExperiments();
      target.experiments.plan = {
        ...aiRecordMeta(payload),
        generatedAt: new Date().toISOString(),
        result: enrichExperimentPlan(payload.result)
      };
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage("实验账本已生成", payload));
  } catch (error) {
    handleAiFailure(error);
  } finally {
    finishAiJob();
    aiBusy = false;
    render();
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveIntakeVersion() {
  const project = activeProject();
  const intake = project.intake;
  if (!intake?.analysis?.result) {
    showToast("先生成或整理一版策略初稿。", "error");
    return;
  }
  const saved = updateProject((target) => {
    if (!target.intake.versions) target.intake.versions = [];
    const number = target.intake.versions.length + 1;
    target.intake.versions.unshift({
      id: makeId(),
      name: `策略初稿 v${number}`,
      savedAt: new Date().toISOString(),
      snapshot: cloneJson({
        rawOffer: target.intake.rawOffer,
        clientStrategy: target.intake.clientStrategy,
        operatorNotes: target.intake.operatorNotes,
        strategyAuthority: target.intake.strategyAuthority,
        analysis: target.intake.analysis
      })
    });
    target.intake.versions = target.intake.versions.slice(0, 10);
  });
  render();
  if (saved) showToast("当前策略版本已保存");
}

function restoreIntakeVersion(versionId) {
  const version = activeProject().intake?.versions?.find((item) => item.id === versionId);
  if (!version?.snapshot) return;
  const saved = updateProject((project) => {
    const versions = project.intake.versions || [];
    project.intake = { ...createIntake(), ...cloneJson(version.snapshot), versions };
  });
  render();
  if (saved) showToast(`已恢复 ${version.name}`);
}

function intakeMarkdown(project) {
  const intake = project.intake || createIntake();
  const result = intake.analysis?.result;
  if (!result) return "";
  const draft = result.strategy_draft;
  const lines = [
    `# ${project.name} · 策略初稿`,
    "",
    `> ${result.executive_summary}`,
    "",
    "## 原始资料",
    "",
    "### 客户资料",
    intake.rawOffer || "未提供",
    "",
    "### 客户已有策略",
    intake.clientStrategy || "未提供",
    "",
    "### 优化师补充",
    intake.operatorNotes || "未提供",
    "",
    "## 结构化简报",
    "",
    "| 字段 | 内容 | 状态 | 来源 |",
    "| --- | --- | --- | --- |",
    ...result.brief_fields.map((field) => `| ${BRIEF_FIELD_META[field.key]?.label || field.key} | ${markdownCell(field.value || "—")} | ${intakeStatusText(field.status)} | ${intakeSourceText(field.source)} |`),
    "",
    "## 客户追问",
    "",
    ...(result.clarification_questions.length ? result.clarification_questions.map((item, index) => `${index + 1}. ${item.question}\n   - 原因：${item.reason}`) : ["关键资料已覆盖，无必须追问项。"]),
    "",
    "## 策略初稿",
    "",
    draft.positioning,
    "",
    "### 工作假设",
    ...draft.working_assumptions.map((item) => `- ${item}`),
    "",
    "### 媒体角色",
    ...draft.platform_plan.map((item) => `- **${item.platform}｜${item.role}**：${item.rationale}\n  - ${item.budget_scenario}`),
    "",
    ...markdownSection("Campaign 初步结构", draft.campaign_plan),
    ...markdownSection("素材测试方向", draft.creative_plan),
    ...markdownSection("监测与归因口径", draft.measurement_plan),
    ...markdownSection("首周执行计划", draft.first_week_plan),
    ...markdownSection("风险与前置条件", draft.risks)
  ];
  return lines.join("\n");
}

function markdownCell(value) {
  return String(value || "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function markdownSection(title, items) {
  return [`### ${title}`, ...(items || []).map((item) => `- ${item}`), ""];
}

function exportIntakeMarkdown() {
  const project = activeProject();
  const content = intakeMarkdown(project);
  if (!content) {
    showToast("还没有可导出的策略初稿。", "error");
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-策略初稿.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("策略初稿 文档已导出");
}

async function copyClarificationQuestions() {
  const questions = activeProject().intake?.analysis?.result?.clarification_questions || [];
  const content = questions.map((item, index) => `${index + 1}. ${item.question}`).join("\n");
  try {
    await navigator.clipboard.writeText(content);
    showToast("客户追问已复制");
  } catch {
    showToast("浏览器不允许复制，请使用导出文档。", "error");
  }
}

function adoptIntakeStrategy() {
  const result = activeProject().intake?.analysis?.result;
  if (!result) return;
  const draft = result.strategy_draft;
  const saved = updateProject((project) => {
    const markets = briefFieldValue(result, "markets");
    const audience = briefFieldValue(result, "audience");
    if (markets) project.markets = markets;
    if (!project.strategy) project.strategy = {};
    project.strategy.objective = draft.positioning;
    project.strategy.audience = audience || draft.working_assumptions.join("\n");
    project.strategy.budgetLogic = draft.platform_plan.map((item) => `${item.platform}：${item.budget_scenario}`).join("\n");
    project.strategy.testLogic = draft.first_week_plan.join("\n");
  });
  if (!saved) return;
  location.hash = "strategy";
  render();
  showToast("策略初稿已同步到投放策略，可继续人工修改");
}

function saveLaunchVersion() {
  const packRecord = activeProject().launch?.pack;
  if (!packRecord?.result) {
    showToast("先生成一份投放执行方案。", "error");
    return;
  }
  const saved = updateProject((project) => {
    if (!project.launch) project.launch = createLaunch();
    if (!project.launch.versions) project.launch.versions = [];
    const number = project.launch.versions.length + 1;
    project.launch.versions.unshift({
      id: makeId(),
      name: `投放执行方案 v0.${number}`,
      savedAt: new Date().toISOString(),
      snapshot: cloneJson(project.launch.pack)
    });
    project.launch.versions = project.launch.versions.slice(0, 10);
  });
  render();
  if (saved) showToast("投放执行方案版本已保存");
}

function restoreLaunchVersion(versionId) {
  const version = activeProject().launch?.versions?.find((item) => item.id === versionId);
  if (!version?.snapshot) return;
  const saved = updateProject((project) => {
    if (!project.launch) project.launch = createLaunch();
    project.launch.pack = cloneJson(version.snapshot);
    project.launch.checklist = Object.fromEntries(project.launch.pack.result.launch_checklist.map((item) => [item.id, item.status === "ready"]));
  });
  render();
  if (saved) showToast(`已恢复 ${version.name}`);
}

function saveExperimentVersion() {
  const record = activeProject().experiments?.plan;
  if (!record?.result) {
    showToast("先生成一份实验账本。", "error");
    return;
  }
  const saved = updateProject((project) => {
    if (!project.experiments) project.experiments = createExperiments();
    const number = project.experiments.versions.length + 1;
    project.experiments.versions.unshift({
      id: makeId(),
      name: `实验账本 v0.${number}`,
      savedAt: new Date().toISOString(),
      snapshot: cloneJson(project.experiments.plan)
    });
    project.experiments.versions = project.experiments.versions.slice(0, 10);
  });
  render();
  if (saved) showToast("实验账本版本已保存");
}

function restoreExperimentVersion(versionId) {
  const version = activeProject().experiments?.versions?.find((item) => item.id === versionId);
  if (!version?.snapshot) return;
  const saved = updateProject((project) => {
    if (!project.experiments) project.experiments = createExperiments();
    project.experiments.plan = cloneJson(version.snapshot);
  });
  render();
  if (saved) showToast(`已恢复 ${version.name}`);
}

function launchPackMarkdown(project) {
  const pack = project.launch?.pack?.result;
  if (!pack) return "";
  const lines = [
    `# ${pack.title}`,
    "",
    `> ${pack.executive_summary}`,
    "",
    `- 就绪度：${pack.readiness.score}/100 · ${launchStatusText(pack.readiness.status)}`,
    `- 生成时间：${dateText(project.launch.pack.generatedAt)}`,
    `- 生成来源：${runRecordLabel(project.launch.pack)}`,
    "",
    "## 上线阻塞项",
    "",
    ...(pack.readiness.blockers.length ? pack.readiness.blockers.map((item) => `- ${item}`) : ["- 当前没有硬阻塞项。"]),
    "",
    "## 当前假设",
    "",
    ...(pack.assumptions.length ? pack.assumptions.map((item) => `- ${item}`) : ["- 无。"]),
    "",
    "## 媒体分工与预算",
    "",
    "| 媒体 | 角色 | Campaign 类型 | 占比 | 月预算 |",
    "| --- | --- | --- | ---: | ---: |",
    ...pack.media_plan.map((item) => `| ${markdownCell(item.platform)} | ${markdownCell(item.role)} | ${markdownCell(item.campaign_type)} | ${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`} | ${markdownCell(launchBudgetText(item))} |`),
    "",
    "## Campaign 蓝图",
    "",
    ...pack.campaigns.flatMap((item, index) => [
      `### ${index + 1}. ${item.campaign_name}`,
      "",
      `- 媒体：${item.platform}`,
      `- 目标 / 事件：${item.objective} / ${item.optimization_event}`,
      `- 市场：${item.geo}`,
      `- 出价：${item.bidding}`,
      `- 预算：${item.budget_note}`,
      "- 结构逻辑：",
      ...item.ad_group_logic.map((value) => `  - ${value}`),
      "- 受众与排除：",
      ...item.audience_notes.map((value) => `  - ${value}`),
      ""
    ]),
    "## 素材生产简报",
    "",
    ...pack.creative_briefs.flatMap((item, index) => [
      `### ${index + 1}. ${item.platform} · ${item.angle}`,
      "",
      `> ${item.hook}`,
      "",
      `- 假设：${item.hypothesis}`,
      `- 格式：${item.format}`,
      `- 变体：${item.variants}`,
      `- 单变量：${item.test_variable}`,
      `- 成功指标：${item.success_metric}`,
      "- 生产说明：",
      ...item.production_notes.map((value) => `  - ${value}`),
      "- 合规说明：",
      ...(item.compliance_notes.length ? item.compliance_notes.map((value) => `  - ${value}`) : ["  - 无额外说明。"]),
      ""
    ]),
    "## 监测与归因",
    "",
    `- 最终口径：${pack.measurement.source_of_truth}`,
    `- 主要事件：${pack.measurement.primary_event}`,
    ...markdownSection("辅助事件", pack.measurement.supporting_events),
    ...markdownSection("媒体实时反馈", pack.measurement.platform_feedback),
    ...markdownSection("归因规则", pack.measurement.attribution_rules),
    ...markdownSection("追踪检查", pack.measurement.tracking_checklist),
    "## 上线检查项",
    "",
    "| 类别 | 检查项 | 状态 | 负责人 | 证据 / 缺口 |",
    "| --- | --- | --- | --- | --- |",
    ...pack.launch_checklist.map((item) => `| ${item.category} | ${markdownCell(item.item)} | ${launchStatusText(item.status)} | ${markdownCell(item.owner)} | ${markdownCell(item.evidence)} |`),
    "",
    "## 首 7 天行动",
    "",
    ...pack.first_7_days.flatMap((item) => [`### ${item.period}`, ...item.actions.map((value) => `- ${value}`), `- **决策规则：** ${item.decision_rule}`, ""]),
    "## 待确认问题",
    "",
    ...(pack.open_questions.length ? pack.open_questions.map((item, index) => `${index + 1}. ${item}`) : ["无。"]),
    "",
    "## 风险说明",
    "",
    ...pack.risks.map((item) => `- ${item}`),
    "",
    `---`,
    `OpenAdOps v${APP_VERSION} · 只读规划，不会修改真实广告账户。`
  ];
  return lines.join("\n");
}

function downloadText(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCreativeProductionCsv() {
  const project = activeProject();
  const tasks = creativeTasks(project);
  if (!tasks.length) {
    showToast("没有可导出的素材任务", "error");
    return;
  }
  downloadText(creativeProductionCsv(tasks), safeProjectFileName(project, "Creative-Production.csv"), "text/csv;charset=utf-8");
  showToast(`已导出 ${tasks.length} 条素材任务`);
}

function exportCreativeProductionMarkdown() {
  const project = activeProject();
  const tasks = creativeTasks(project);
  if (!tasks.length) {
    showToast("没有可导出的素材任务", "error");
    return;
  }
  downloadText(
    creativeProductionMarkdown(project, tasks, APP_VERSION),
    safeProjectFileName(project, "Creative-Production.md"),
    "text/markdown;charset=utf-8"
  );
  showToast(`已导出 ${tasks.length} 条素材任务`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImportedProject(project) {
  const normalized = {
    ...project,
    id: project.id || makeId(),
    name: project.name || "导入项目",
    platforms: Array.isArray(project.platforms) && project.platforms.length ? project.platforms : ["Google Ads"],
    intake: createIntake(project.intake || {}),
    launch: createLaunch(project.launch || {}),
    experiments: createExperiments(project.experiments || {}),
    strategy: isRecord(project.strategy)
      ? project.strategy
      : { objective: "", audience: "", budgetLogic: "", testLogic: "", budgetShares: {} },
    creativePlan: Array.isArray(project.creativePlan) ? project.creativePlan : [],
    ai: isRecord(project.ai) ? project.ai : {},
    optimizationHistory: projectOptimizationHistory(project),
    performanceTargets: normalizePerformanceTargets(project, { makeId }),
    targetReview: String(project.targetReview || ""),
    createdAt: project.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  syncCreativeProduction(normalized);
  return normalized;
}

function exportWorkspaceBackup() {
  try {
    const backup = buildWorkspaceBackup(state, { appVersion: APP_VERSION });
    downloadText(
      JSON.stringify(backup, null, 2),
      backupFileName({ kind: "workspace", exportedAt: backup.exportedAt }),
      "application/json;charset=utf-8"
    );
    showToast(`已导出全部工作区（${backup.projectCount} 个项目）`);
  } catch (error) {
    showToast(`导出失败：${error.message}`, "error");
  }
}

function exportActiveProjectBackup() {
  try {
    const project = activeProject();
    if (!project) {
      showToast("没有可导出的项目", "error");
      return;
    }
    const backup = buildProjectBackup(project, { appVersion: APP_VERSION });
    downloadText(
      JSON.stringify(backup, null, 2),
      backupFileName({ kind: "project", projectName: project.name, exportedAt: backup.exportedAt }),
      "application/json;charset=utf-8"
    );
    showToast(`已导出项目「${project.name}」`);
  } catch (error) {
    showToast(`导出失败：${error.message}`, "error");
  }
}

async function importWorkspaceBackupFile(file) {
  if (!file) return;
  if (aiBusy) {
    showToast("请等待当前 AI 任务完成或取消后再导入备份。", "error");
    if (importWorkspaceFile) importWorkspaceFile.value = "";
    return;
  }
  try {
    const text = await file.text();
    const parsed = parseBackupJson(text);
    const incoming = parsed.projects.map(normalizeImportedProject);
    const incomingMappingProfiles = normalizeMappingProfiles(parsed.mappingProfiles);
    if (!incoming.length) {
      showToast("备份里没有可导入的项目", "error");
      return;
    }

    const mode = window.confirm(
      `将导入 ${incoming.length} 个项目。\n\n确定 = 合并到当前工作区（同名 ID 会生成新 ID）\n取消 = 中止导入`
    );
    if (!mode) {
      showToast("已取消导入");
      return;
    }

    const replaceAll = window.confirm(
      "是否用备份替换当前全部项目？\n\n确定 = 替换全部（请确认已有备份）\n取消 = 仅合并新增"
    );

    let nextState;
    if (replaceAll) {
      const ok = window.confirm(`确认替换？当前 ${state.projects.length} 个项目将被覆盖为备份中的 ${incoming.length} 个。`);
      if (!ok) {
        showToast("已取消导入");
        return;
      }
      nextState = {
        activeProjectId: incoming.find((item) => item.id === parsed.activeProjectId)?.id || incoming[0].id,
        aiMode: isStaticDemo ? "mock" : parsed.aiMode || state.aiMode,
        mappingProfiles: incomingMappingProfiles,
        projects: incoming
      };
    } else {
      const { projects, imported } = mergeProjects(state.projects, incoming, { makeId, reassignOnConflict: true });
      if (!imported.length) {
        showToast("没有新项目被导入", "error");
        return;
      }
      const mergedProfiles = mergeMappingProfiles(state.mappingProfiles, incomingMappingProfiles, { makeId });
      nextState = {
        ...state,
        projects,
        mappingProfiles: mergedProfiles.profiles,
        activeProjectId: imported[0].id
      };
    }

    if (!commitState(nextState)) return;
    render();
    showToast(replaceAll ? `已用备份替换工作区（${state.projects.length} 个项目）` : `已合并导入 ${incoming.length} 个项目`);
  } catch (error) {
    showToast(`导入失败：${error.message}`, "error");
  } finally {
    if (importWorkspaceFile) importWorkspaceFile.value = "";
  }
}

function safeProjectFileName(project, suffix) {
  return `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-${suffix}`;
}

function exportLaunchPackMarkdown() {
  const project = activeProject();
  const content = launchPackMarkdown(project);
  if (!content) {
    showToast("还没有可导出的投放执行方案。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Launch-Pack.md"), "text/markdown;charset=utf-8");
  showToast("投放执行方案 文档已导出");
}

function launchPackDocument(project) {
  const pack = project.launch?.pack?.result;
  if (!pack) return "";
  const gateRows = pack.launch_checklist.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td><strong>${escapeHtml(item.item)}</strong></td><td><span class="status ${attr(item.status)}">${escapeHtml(launchStatusText(item.status))}</span></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.evidence)}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pack.title)}</title><style>
  :root{--ink:#17212b;--muted:#687382;--line:#dfe4e8;--paper:#fff;--bg:#edf0f2;--accent:#e86f34;--accent-soft:#fff0e8;--success:#247a55;--risk:#b8443e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,Arial,"PingFang SC",sans-serif}main{width:min(1120px,calc(100% - 32px));margin:32px auto;background:var(--paper);padding:56px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--accent)}h1{font-size:42px;line-height:1.12;margin:10px 0 20px}.lead{font-size:16px;line-height:1.8;color:var(--muted);max-width:860px}.readiness{margin:34px 0;display:grid;grid-template-columns:150px 1fr 220px;gap:28px;padding:26px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(135deg,#fff,var(--accent-soft))}.score strong{font-size:58px}.score span{color:var(--muted)}.state{font-size:24px;font-weight:800}.blockers{border-left:1px solid var(--line);padding-left:22px}.blockers strong{display:block;font-size:32px}.meta{display:flex;gap:18px;color:var(--muted);font-size:12px}.section{margin-top:42px}.section h2{font-size:22px;margin:0 0 16px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{border:1px solid var(--line);border-radius:12px;padding:18px;break-inside:avoid}.card span{font-size:10px;font-weight:800;color:var(--accent);letter-spacing:.08em}.card h3{font-size:16px;margin:8px 0}.card p,.card li{font-size:12px;line-height:1.7;color:var(--muted)}blockquote{margin:12px 0;padding:12px 14px;border-left:3px solid var(--accent);background:var(--accent-soft);font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:9px;letter-spacing:.08em;text-transform:uppercase}.status{display:inline-block;padding:4px 8px;border-radius:99px;background:#eef1f3}.status.ready{color:var(--success);background:#e7f5ee}.status.blocker{color:var(--risk);background:#fdebea}.week{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.week strong{display:block;margin-bottom:8px}.foot{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}@media(max-width:760px){main{width:100%;margin:0;padding:24px}.readiness,.cards,.week{grid-template-columns:1fr}.blockers{border-left:0;border-top:1px solid var(--line);padding:14px 0 0}h1{font-size:30px}}@media print{body{background:#fff}main{width:auto;margin:0;padding:28px}.section{break-inside:auto}.card{break-inside:avoid}}
  </style></head><body><main><p class="eyebrow">OPENADOPS · 投放执行方案 · v${APP_VERSION}</p><h1>${escapeHtml(pack.title)}</h1><p class="lead">${escapeHtml(pack.executive_summary)}</p><div class="meta"><span>${escapeHtml(project.industry)} App</span><span>${escapeHtml(project.markets || "市场待确认")}</span><span>${escapeHtml(project.platforms.join(" / "))}</span><span>${dateText(project.launch.pack.generatedAt)}</span></div><section class="readiness"><div class="score"><strong>${pack.readiness.score}</strong><span>/100</span></div><div><div class="state">${escapeHtml(launchStatusText(pack.readiness.status))}</div><p>${pack.assumptions.map((item) => escapeHtml(item)).join("<br>") || "关键输入已覆盖。"}</p></div><div class="blockers"><span>阻塞项</span><strong>${pack.readiness.blockers.length}</strong><p>${pack.readiness.blockers.map((item) => escapeHtml(item)).join("<br>") || "没有硬阻塞项"}</p></div></section><section class="section"><h2>01 · 媒体分工与预算</h2><table><thead><tr><th>媒体</th><th>角色</th><th>Campaign</th><th>占比</th><th>预算</th></tr></thead><tbody>${pack.media_plan.map((item) => `<tr><td><strong>${escapeHtml(item.platform)}</strong></td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.campaign_type)}</td><td>${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`}</td><td>${escapeHtml(launchBudgetText(item))}</td></tr>`).join("")}</tbody></table></section><section class="section"><h2>02 · Campaign 蓝图</h2><div class="cards">${pack.campaigns.map((item) => `<article class="card"><span>${escapeHtml(item.platform)}</span><h3>${escapeHtml(item.campaign_name)}</h3><p><strong>目标 / 事件：</strong>${escapeHtml(item.objective)} / ${escapeHtml(item.optimization_event)}<br><strong>市场：</strong>${escapeHtml(item.geo)}<br><strong>出价：</strong>${escapeHtml(item.bidding)}<br><strong>预算：</strong>${escapeHtml(item.budget_note)}</p><ul>${item.ad_group_logic.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article>`).join("")}</div></section><section class="section"><h2>03 · 素材生产简报</h2><div class="cards">${pack.creative_briefs.map((item) => `<article class="card"><span>${escapeHtml(item.platform)} · ${item.variants} 个版本</span><h3>${escapeHtml(item.angle)}</h3><blockquote>${escapeHtml(item.hook)}</blockquote><p><strong>假设：</strong>${escapeHtml(item.hypothesis)}</p><p><strong>格式：</strong>${escapeHtml(item.format)}<br><strong>单变量：</strong>${escapeHtml(item.test_variable)}<br><strong>成功指标：</strong>${escapeHtml(item.success_metric)}</p></article>`).join("")}</div></section><section class="section"><h2>04 · 监测与归因</h2><article class="card"><h3>${escapeHtml(pack.measurement.source_of_truth)}</h3><p><strong>主要事件：</strong>${escapeHtml(pack.measurement.primary_event)}</p><ul>${[...pack.measurement.supporting_events,...pack.measurement.attribution_rules,...pack.measurement.tracking_checklist].map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article></section><section class="section"><h2>05 · 上线检查项</h2><table><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${gateRows}</tbody></table></section><section class="section"><h2>06 · 首 7 天行动</h2><div class="week">${pack.first_7_days.map((item) => `<article class="card"><strong>${escapeHtml(item.period)}</strong>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<blockquote>${escapeHtml(item.decision_rule)}</blockquote></article>`).join("")}</div></section><section class="section"><h2>07 · 待确认与风险</h2><div class="cards"><article class="card"><h3>待确认问题</h3><ol>${pack.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>无</li>"}</ol></article><article class="card"><h3>风险说明</h3><ul>${pack.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div></section><p class="foot">OpenAdOps v${APP_VERSION} · 本文件为投前工作草案，不会修改真实广告账户；正式上线前由项目负责人和相关合规人员确认。</p></main></body></html>`;
}

function exportLaunchPackHtml() {
  const project = activeProject();
  const content = launchPackDocument(project);
  if (!content) {
    showToast("还没有可导出的投放执行方案。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Launch-Pack.html"), "text/html;charset=utf-8");
  showToast("投放执行方案网页已导出");
}

function experimentMarkdown(project) {
  const record = project.experiments?.plan;
  const plan = record?.result;
  if (!plan) return "";
  const summary = experimentPlanSummary(plan);
  return [
    `# ${plan.title}`,
    "",
    `> ${plan.executive_summary}`,
    "",
    `- 实验总数：${summary.total}`,
    `- 周期可行：${summary.ready}`,
    `- 进行中：${summary.running}`,
    `- 已沉淀学习：${summary.learnings}`,
    `- 生成来源：${runRecordLabel(record)}`,
    "",
    "## 学习议程",
    "",
    ...plan.learning_agenda.map((item) => `- ${item}`),
    "",
    "## 实验队列",
    "",
    ...plan.experiments.flatMap((item, index) => [
      `### ${index + 1}. ${item.name}`,
      "",
      `- 媒体 / 方法：${item.platform} / ${item.design.test_type}`,
      `- 优先级 / 状态：${experimentPriorityText(item.priority)} / ${experimentStatusText(item.status)}`,
      `- Owner：${item.owner}`,
      "",
      `**IF** ${item.hypothesis.change} **THEN** ${item.hypothesis.metric} 将${item.hypothesis.direction === "increase" ? "提升" : "下降"}${item.hypothesis.expected_lift_percent === null ? "" : `约 ${item.hypothesis.expected_lift_percent}%`} **BECAUSE** ${item.hypothesis.because}`,
      "",
      "| 对照组 | 单一变量 | 实验组 |",
      "| --- | --- | --- |",
      `| ${markdownCell(item.design.control)} | ${markdownCell(item.design.single_variable)} | ${markdownCell(item.design.variant)} |`,
      "",
      `- 主指标：${item.design.primary_metric}`,
      `- 护栏指标：${item.design.guardrail_metrics.join("；")}`,
      `- 分流：${item.design.control_percent}/${item.design.variant_percent}`,
      `- 基准率：${item.design.baseline_rate_percent === null ? "待补充" : `${item.design.baseline_rate_percent}%`}`,
      `- MDE：${item.design.mde_percent === null ? "待补充" : `${item.design.mde_percent}%`}`,
      `- 每日可进入样本：${item.design.daily_eligible_units === null ? "待补充" : formatMetric(item.design.daily_eligible_units)}`,
      `- 每版本样本：${item.feasibility.required_sample_per_variant === null ? "不可计算" : formatMetric(item.feasibility.required_sample_per_variant)}`,
      `- 预计周期：${item.feasibility.estimated_duration_days === null ? "不可计算" : `${item.feasibility.estimated_duration_days} 天`}`,
      `- 可行性：${feasibilityText(item.feasibility.status)}。${item.feasibility.rationale}`,
      "",
      "#### 设置步骤",
      ...item.setup_steps.map((value) => `- ${value}`),
      "",
      "#### 停止条件",
      ...item.stop_conditions.map((value) => `- ${value}`),
      "",
      "#### 决策规则",
      `- Win：${item.decision_rules.win}`,
      `- Lose：${item.decision_rules.lose}`,
      `- Inconclusive：${item.decision_rules.inconclusive}`,
      "",
      "#### 结果与学习",
      `- 结论：${experimentOutcomeText(item.result.outcome)}`,
      `- 对照组 / 实验组：${item.result.control_value ?? "—"} / ${item.result.variant_value ?? "—"}`,
      `- 相对变化：${item.result.relative_change_percent === null ? "—" : `${item.result.relative_change_percent}%`}`,
      `- 证据：${item.result.evidence || "待补充"}`,
      `- 学习：${item.result.learning || "待补充"}`,
      `- 下一步：${item.result.next_action || "待补充"}`,
      ""
    ]),
    "## 风险与判断边界",
    "",
    ...plan.risks.map((item) => `- ${item}`),
    "",
    "---",
    `OpenAdOps v${APP_VERSION} · 只规划和记录实验，不修改真实广告账户。`
  ].join("\n");
}

function exportExperimentMarkdown() {
  const project = activeProject();
  const content = experimentMarkdown(project);
  if (!content) {
    showToast("还没有可导出的实验账本。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Experiment-Ledger.md"), "text/markdown;charset=utf-8");
  showToast("实验账本 文档已导出");
}

function experimentDocument(project) {
  const record = project.experiments?.plan;
  const plan = record?.result;
  if (!plan) return "";
  const summary = experimentPlanSummary(plan);
  const cards = plan.experiments.map((item, index) => `<article class="experiment"><header><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(item.platform)}</span><h2>${escapeHtml(item.name)}</h2><div><em>${escapeHtml(experimentPriorityText(item.priority))}</em><em>${escapeHtml(experimentStatusText(item.status))}</em><em>${escapeHtml(feasibilityText(item.feasibility.status))}</em></div></header><blockquote><b>IF</b> ${escapeHtml(item.hypothesis.change)} <b>THEN</b> ${escapeHtml(item.hypothesis.metric)} 将${item.hypothesis.direction === "increase" ? "提升" : "下降"} <b>BECAUSE</b> ${escapeHtml(item.hypothesis.because)}</blockquote><section class="variants"><div><span>CONTROL · ${item.design.control_percent}%</span><strong>${escapeHtml(item.design.control)}</strong></div><i>${escapeHtml(item.design.single_variable)}</i><div><span>VARIANT · ${item.design.variant_percent}%</span><strong>${escapeHtml(item.design.variant)}</strong></div></section><section class="facts"><div><span>主指标</span><strong>${escapeHtml(item.design.primary_metric)}</strong></div><div><span>每版本样本</span><strong>${item.feasibility.required_sample_per_variant === null ? "—" : formatMetric(item.feasibility.required_sample_per_variant)}</strong></div><div><span>预计周期</span><strong>${item.feasibility.estimated_duration_days === null ? "—" : `${item.feasibility.estimated_duration_days} 天`}</strong></div><div><span>实验方法</span><strong>${escapeHtml(item.design.test_type)}</strong></div></section><p class="rationale">${escapeHtml(item.feasibility.rationale)}</p><section class="rules"><div><span>WIN</span><p>${escapeHtml(item.decision_rules.win)}</p></div><div><span>LOSE</span><p>${escapeHtml(item.decision_rules.lose)}</p></div><div><span>INCONCLUSIVE</span><p>${escapeHtml(item.decision_rules.inconclusive)}</p></div></section><section class="result"><div><span>结果</span><strong>${escapeHtml(experimentOutcomeText(item.result.outcome))}</strong></div><p><b>证据：</b>${escapeHtml(item.result.evidence || "待补充")}</p><p><b>学习：</b>${escapeHtml(item.result.learning || "待补充")}</p><p><b>下一步：</b>${escapeHtml(item.result.next_action || "待补充")}</p></section></article>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(plan.title)}</title><style>
  :root{--ink:#17212b;--muted:#687382;--line:#dfe4e8;--paper:#fff;--bg:#edf0f2;--accent:#e86f34;--soft:#fff0e8;--blue:#315d96;--green:#247a55}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,Arial,"PingFang SC",sans-serif}main{width:min(1120px,calc(100% - 32px));margin:32px auto;background:var(--paper);padding:56px}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--accent)}h1{font-size:42px;line-height:1.1;margin:10px 0 18px}.lead{max-width:850px;color:var(--muted);line-height:1.8}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:30px 0}.summary div{padding:18px;border:1px solid var(--line);border-radius:12px}.summary strong,.summary span{display:block}.summary strong{font-size:28px}.summary span{margin-top:5px;color:var(--muted);font-size:10px}.agenda{padding:20px;border-radius:14px;background:#17212b;color:#fff}.agenda p{margin:7px 0;color:#bec7d0;font-size:12px}.experiment{margin-top:22px;padding:24px;border:1px solid var(--line);border-radius:16px;break-inside:avoid}.experiment header>span{color:var(--accent);font-size:10px;font-weight:800}.experiment h2{font-size:20px;margin:7px 0}.experiment header em{display:inline-block;margin-right:6px;padding:5px 8px;border-radius:99px;background:#eef1f4;color:var(--muted);font-size:9px;font-style:normal}blockquote{margin:18px 0;padding:15px;border-left:3px solid var(--accent);background:var(--soft);font-size:12px;line-height:1.7}.variants{display:grid;grid-template-columns:1fr 120px 1fr;align-items:stretch;gap:10px}.variants div{padding:16px;border:1px solid var(--line);border-radius:11px}.variants span,.facts span,.rules span,.result span{display:block;color:var(--muted);font-size:9px;font-weight:800}.variants strong{display:block;margin-top:9px;font-size:12px}.variants i{display:grid;place-items:center;padding:10px;border-radius:11px;background:#17212b;color:#fff;font-size:10px;font-style:normal;text-align:center}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.facts div{padding:12px;background:#f6f7f8;border-radius:9px}.facts strong{display:block;margin-top:6px;font-size:11px}.rationale{font-size:10px;color:var(--muted);line-height:1.6}.rules{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.rules div{padding:13px;border-top:2px solid var(--accent);background:#fafbfc}.rules p,.result p{font-size:10px;line-height:1.6;color:var(--muted)}.result{margin-top:12px;padding:15px;border:1px dashed var(--line);border-radius:10px}.result>div{display:flex;justify-content:space-between}.foot{margin-top:38px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:9px}@media(max-width:760px){main{width:100%;margin:0;padding:24px}h1{font-size:30px}.summary,.facts,.rules,.variants{grid-template-columns:1fr}.variants i{min-height:44px}}@media print{body{background:#fff}main{width:auto;margin:0;padding:24px}.experiment{break-inside:avoid}}
  </style></head><body><main><p class="eyebrow">OPENADOPS · 实验账本 · v${APP_VERSION}</p><h1>${escapeHtml(plan.title)}</h1><p class="lead">${escapeHtml(plan.executive_summary)}</p><section class="summary"><div><strong>${summary.total}</strong><span>实验总数</span></div><div><strong>${summary.ready}</strong><span>周期可行</span></div><div><strong>${summary.running}</strong><span>进行中</span></div><div><strong>${summary.learnings}</strong><span>已沉淀学习</span></div></section><section class="agenda">${plan.learning_agenda.map((item, index) => `<p>${String(index + 1).padStart(2, "0")} · ${escapeHtml(item)}</p>`).join("")}</section>${cards}<p class="foot">OpenAdOps v${APP_VERSION} · 生成来源：${escapeHtml(runRecordLabel(record))} · 只规划和记录实验，不会修改真实广告账户。</p></main></body></html>`;
}

function exportExperimentHtml() {
  const project = activeProject();
  const content = experimentDocument(project);
  if (!content) {
    showToast("还没有可导出的实验账本。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Experiment-Ledger.html"), "text/html;charset=utf-8");
  showToast("实验账本网页已导出");
}

function reportDocument(project) {
  const record = latestAnalysis(project);
  const result = record?.result;
  const summary = project.data?.metrics?.summary || {};
  const metricRows = [
    ["Spend", formatMetric(summary.spend, "currency", project.currency)],
    ["AF Installs", availableMetric(project, "af_installs", summary.af_installs)],
    ["AF-CPI", dataHasField(project, "af_installs") ? formatMetric(summary.afCpi, "currency", project.currency) : "—"],
    ["CTR", formatMetric(summary.ctr, "percent")],
    ["D1 Retention", formatMetric(summary.d1Retention, "percent")],
    ["ROAS", dataHasField(project, "revenue") ? formatMetric(summary.roas, "ratio") : "—"]
  ];
  const experimentRows = (project.experiments?.plan?.result?.experiments || []).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(experimentStatusText(item.status))}</td><td>${escapeHtml(feasibilityText(item.feasibility.status))}</td><td>${escapeHtml(experimentOutcomeText(item.result.outcome))}</td><td>${escapeHtml(item.result.learning || item.result.next_action || "等待结果")}</td></tr>`).join("");
  const decisionRows = projectOptimizationHistory(project).slice(0, 5).map((run) => `<tr><td>${escapeHtml(dateTimeText(run.generatedAt))}</td><td>${escapeHtml(run.dataContext?.sourceFile || "未记录")}<br>${escapeHtml(optimizationPeriodText(run))}</td><td>${escapeHtml(optimizationStatusText(run.status))}</td><td>${escapeHtml(run.note || "待补充")}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(project.name)}投放报告</title><style>
  body{margin:0;background:#f3f4f6;color:#1b2430;font-family:Arial,"PingFang SC",sans-serif}main{width:1040px;margin:32px auto;padding:50px;background:#fff;box-sizing:border-box}.eyebrow{color:#e77436;font-size:11px;font-weight:700;letter-spacing:.12em}h1{font-size:34px;margin:8px 0 38px}h2{font-size:18px;margin:34px 0 14px}.meta{color:#77808b;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric,.finding{border:1px solid #e5e8ec;border-radius:10px;padding:16px}.metric span{display:block;color:#77808b;font-size:11px}.metric strong{display:block;margin-top:9px;font-size:21px}.summary{border-left:3px solid #e77436;background:#fff1e8;padding:17px;line-height:1.7}.finding{margin-top:10px}.finding h3{margin:0 0 9px;font-size:15px}.finding p{font-size:12px;line-height:1.7;color:#5f6b79}.actions{width:100%;border-collapse:collapse}.actions th,.actions td{padding:11px;border-bottom:1px solid #e5e8ec;text-align:left;font-size:11px}.notice{margin-top:34px;color:#8c96a3;font-size:10px}@media print{body{background:#fff}main{width:auto;margin:0;padding:24px}}
  </style></head><body><main><p class="eyebrow">OVERSEAS APP UA · PERFORMANCE REVIEW</p><h1>${escapeHtml(project.name)}<br>投放阶段复盘与下一步计划</h1><p class="meta">${escapeHtml(project.industry)} App · ${escapeHtml(project.platforms.join(" / "))} · ${escapeHtml(project.markets)} · ${dateText(new Date().toISOString())}</p><h2>核心指标</h2><div class="metrics">${metricRows.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><h2>管理层摘要</h2><div class="summary">${escapeHtml(result?.executive_summary || "尚未生成结构化分析。")}</div><h2>关键判断</h2>${result?.findings?.map((item) => `<section class="finding"><h3>${escapeHtml(item.title)}</h3><p><strong>证据：</strong>${escapeHtml(item.evidence)}</p><p><strong>判断：</strong>${escapeHtml(item.diagnosis)}</p><p><strong>动作：</strong>${escapeHtml(item.action)}</p><p><strong>验证：</strong>${escapeHtml(item.validation)}</p></section>`).join("") || "<p>暂无。</p>"}<h2>实验与学习</h2><table class="actions"><thead><tr><th>实验</th><th>状态</th><th>可行性</th><th>结果</th><th>学习</th></tr></thead><tbody>${experimentRows}</tbody></table><h2>下一步动作</h2><table class="actions"><thead><tr><th>动作</th><th>负责人</th><th>时间</th><th>成功指标</th></tr></thead><tbody>${result?.next_actions?.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.timing)}</td><td>${escapeHtml(item.success_metric)}</td></tr>`).join("") || ""}</tbody></table><h2>优化决策记录</h2><table class="actions"><thead><tr><th>诊断时间</th><th>数据与周期</th><th>状态</th><th>人工结论</th></tr></thead><tbody>${decisionRows || "<tr><td colspan=\"4\">暂无记录</td></tr>"}</tbody></table><p class="notice">数据来源：${escapeHtml(project.data?.fileName || "未导入")} · 归因口径：${escapeHtml(project.attribution)} · ${project.isDemo ? "演示数据，不代表任何真实客户表现。" : "由 OpenAdOps 本地工作台生成。"}</p></main></body></html>`;
}

function exportReport() {
  const project = activeProject();
  const blob = new Blob([reportDocument(project)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-投放报告.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("报告网页已导出");
}

projectSelect.addEventListener("change", () => {
  const nextState = { ...state, activeProjectId: projectSelect.value };
  if (!commitState(nextState)) {
    render();
    return;
  }
  importSession = null;
  render();
});

function setAiMode(mode) {
  if (aiBusy) return;
  if (isStaticDemo && mode === "codex") {
    showToast("在线演示只能使用本地演示模式，请本机 npm start 后使用 GPT-5.6。", "error");
    return;
  }
  const nextState = { ...state, aiMode: mode === "codex" ? "codex" : "mock" };
  if (!commitState(nextState)) {
    render();
    return;
  }
  if (aiModeSelect) aiModeSelect.value = state.aiMode;
  render();
}

document.querySelectorAll("[data-ai-mode]").forEach((button) => {
  button.addEventListener("click", () => setAiMode(button.dataset.aiMode));
});
if (aiModeSelect) {
  aiModeSelect.addEventListener("change", () => setAiMode(aiModeSelect.value));
}

newProjectButton.addEventListener("click", () => projectDialog.showModal());
exportWorkspaceButton?.addEventListener("click", exportWorkspaceBackup);
exportProjectButton?.addEventListener("click", exportActiveProjectBackup);
importWorkspaceButton?.addEventListener("click", () => {
  if (aiBusy) {
    showToast("请等待当前 AI 任务完成或取消后再导入备份。", "error");
    return;
  }
  importWorkspaceFile?.click();
});
importWorkspaceFile?.addEventListener("change", () => {
  const file = importWorkspaceFile.files?.[0];
  importWorkspaceBackupFile(file);
});
aiCancelButton.addEventListener("click", cancelAiJob);
aiErrorDismiss.addEventListener("click", clearPersistentError);
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => projectDialog.close()));
projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const platforms = formData.getAll("platforms");
  if (!platforms.length) {
    showToast("至少选择一个投放媒体", "error");
    return;
  }
  const project = {
    id: makeId(),
    name: String(formData.get("name") || "未命名项目"),
    industry: String(formData.get("industry") || "工具"),
    platforms,
    markets: String(formData.get("markets") || ""),
    budget: Number(formData.get("budget") || 0),
    currency: String(formData.get("currency") || "USD"),
    goal: String(formData.get("goal") || "Install"),
    performanceTargets: [],
    targetReview: "",
    attribution: "AppsFlyer",
    stage: "准备期",
    sellingPoints: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: { objective: "", audience: "", budgetLogic: "", testLogic: "", budgetShares: Object.fromEntries(platforms.map((platform) => [platform, Math.round(100 / platforms.length)])) },
    creativePlan: [],
    creativeProduction: { tasks: [], updatedAt: new Date().toISOString() },
    launch: createLaunch(),
    experiments: createExperiments(),
    intake: createIntake(),
    optimizationHistory: [],
    ai: {}
  };
  const nextState = {
    ...state,
    projects: [...state.projects, project],
    activeProjectId: project.id
  };
  if (!commitState(nextState)) return;
  projectForm.reset();
  projectDialog.close();
  location.hash = "intake";
  render();
  showToast("项目已创建");
});

window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "overview";
render();
const initialStorageWarning = workspaceLoadWarning(stateLoadResult);
if (initialStorageWarning) showToast(initialStorageWarning, "error");
loadAiRuntime().then(() => {
  if (!aiBusy) render();
});
