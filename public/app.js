import {
  FIELD_LABELS,
  calculateDateQuality,
  calculateMetrics,
  calculateNumericQuality,
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
import {
  buildApiAnalysisPrompt,
  buildApiCreativeRequirementsPrompt,
  buildApiIntakePrompt,
  buildApiLaunchPackPrompt
} from "./lib/api-prompts.js";
import {
  apiProtocolLabel,
  defaultApiPreferences,
  normalizeApiPreferences,
  publicApiRoutes
} from "./lib/api-routes.js";
import { buildMockAnalysis } from "./lib/mock-analysis.js";
import { buildMockCreativeRequirements } from "./lib/mock-creative-requirements.js";
import { buildMockExperimentPlan } from "./lib/mock-experiment-plan.js";
import { buildMockIntake, INTAKE_BRIEF_FIELDS } from "./lib/mock-intake.js";
import { buildMockLaunchPack } from "./lib/mock-launch-pack.js";
import {
  creativeRequirementsFeishuTable,
  creativeRequirementInstructions,
  creativeRequirementFromSuggestion,
  legacyCreativePlan,
  normalizeCreativeProduction,
  normalizeCreativeTask
} from "./lib/creative-production.js";
import { modelFullName, modelRouteDetail, modelVariantName } from "./lib/model-labels.js";
import {
  appendOptimizationRun,
  buildOptimizationRun,
  normalizeOptimizationHistory,
  updateOptimizationRun,
  updateOptimizationRunAction
} from "./lib/optimization-history.js";
import {
  OPTIMIZATION_ACTION_CATEGORIES,
  OPTIMIZATION_ACTION_STATUSES,
  actionMetricChange,
  optimizationReviewFeishuTable
} from "./lib/optimization-actions.js";
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
  equalBudgetShares,
  normalizePerformanceTargets,
  targetHint
} from "./lib/project-targets.js";
import { PROJECT_STAGES, normalizeProjectStage } from "./lib/project-stage.js";
import {
  buildStrategyDecisionComplete,
  createBuildAdGroup,
  ensureBuildStrategy,
  normalizeBuildStrategy
} from "./lib/build-strategy.js";
import { strategyWorkbookDownload } from "./lib/xlsx-export.js";
import {
  dataQualityIssues,
  dataQualityNeedsAttention,
  dataQualityText
} from "./lib/data-quality.js";
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
const ROUTES = new Set(["overview", "intake", "strategy", "creative", "launch", "optimize", "report"]);
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
const apiSettingsButton = document.querySelector("#apiSettingsButton");
const apiDialog = document.querySelector("#apiDialog");
const apiForm = document.querySelector("#apiForm");
const apiProtocolInputs = [...document.querySelectorAll('input[name="protocol"]')];
const apiKeyInput = document.querySelector("#apiKey");
const apiKeyToggle = document.querySelector("#apiKeyToggle");
const apiBaseUrlInput = document.querySelector("#apiBaseUrl");
const apiModelInput = document.querySelector("#apiModel");
const apiModelHelp = document.querySelector("#apiModelHelp");
const apiClearButton = document.querySelector("#apiClearButton");
const apiConnectionStatus = document.querySelector("#apiConnectionStatus");
let importSession = null;
let aiBusy = false;
let creativeAiPanelOpen = false;
let currentAiJob = null;
let aiJobTimer = null;
let aiJobTicks = 0;
let runtimeKind = "unknown";
let pendingApiActivation = false;
let apiSession = { apiKey: "", ...defaultApiPreferences(), connected: false };
const DEFAULT_CODEX_ROUTES = {
  intakeQuestions: { label: "生成投放前策略清单", model: "gpt-5.6-terra", effort: "low", expectedSeconds: [30, 90] },
  intakeStrategy: { label: "快速生成策略初稿", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] },
  intakeDeep: { label: "深度复核策略初稿", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] },
  analysis: { label: "投放数据诊断", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] },
  creativeRequirements: { label: "生成素材需求建议", model: "gpt-5.6-terra", effort: "medium", expectedSeconds: [60, 180] },
  optimizeAnalysis: { label: "投放优化诊断", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] },
  launchPack: { label: "生成上线执行清单", model: "gpt-5.6-sol", effort: "high", expectedSeconds: [120, 300] }
};
const DEFAULT_GROK_ROUTES = Object.fromEntries(
  Object.entries(DEFAULT_CODEX_ROUTES).map(([key, route]) => [
    key,
    { ...route, model: "grok-4.5", effort: "high", fallbackModel: null, provider: "grok" }
  ])
);
let codexRoutes = { ...DEFAULT_CODEX_ROUTES };
let grokRoutes = { ...DEFAULT_GROK_ROUTES };
let apiRoutes = publicApiRoutes("openai");
let aiRoutes = { ...DEFAULT_GROK_ROUTES };
let runtimeProviders = {};

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
  const availableFields = Object.keys(mapping).filter((field) => mapping[field]);
  return calculateMetrics(mapRows(parsed.rows, mapping), { availableFields });
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

function demoDateQuality() {
  const parsed = parseCsv(DEMO_CSV);
  const mapping = detectMapping(parsed.headers);
  return calculateDateQuality(mapRows(parsed.rows, mapping));
}

function demoNumericQuality() {
  const parsed = parseCsv(DEMO_CSV);
  const mapping = detectMapping(parsed.headers);
  const quality = calculateNumericQuality(parsed.rows, mapping);
  return {
    checkedFields: quality.checkedFields,
    invalidCells: quality.invalidCells,
    blankCells: quality.blankCells
  };
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
  const current = normalizeCreativeProduction(project, { makeId, now });
  const normalized = tasks
    ? tasks.map((task) => normalizeCreativeTask(task, {
        makeId,
        now,
        defaultPlatform: project.platforms?.[0],
        defaultMarket: project.markets
      }))
    : current.tasks;
  project.creativeProduction = {
    ...current,
    ...(project.creativeProduction || {}),
    mode: project.creativeProduction?.mode || current.mode,
    notes: String(project.creativeProduction?.notes || current.notes || ""),
    commonRequirements: String(project.creativeProduction?.commonRequirements || current.commonRequirements || ""),
    analysis: project.creativeProduction?.analysis || current.analysis || null,
    tasks: normalized,
    updatedAt: now
  };
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
      enabled: true,
      objective: "用可控成本建立三媒体安装基线，同时验证留存质量。",
      audience: "18–34 岁、日常使用社交与内容工具的移动端用户。",
      budgetLogic: "70% 稳定获量、20% 素材放量、10% 新市场探索。",
      testLogic: "先固定国家与出价，仅测试 Hook；3 天达到判定门槛后再调整预算。",
      budgetShares: { "Google Ads": 40, "Meta Ads": 35, "TikTok Ads": 25 },
      campaign: {
        name: "APP_GLOBAL_INSTALL_TEST_01",
        storeUrl: "https://example.com/demo-app",
        os: "Android / iOS",
        language: "按市场语言",
        primaryEvent: "Install",
        supportingEvents: "Registration, D1 Retention, Purchase",
        bidStrategy: "先自动出价建立基线，再评估目标出价",
        placements: "媒体默认版位",
        exclusions: "排除已安装用户"
      },
      adGroups: [
        { id: "demo-build-1", name: "JP_Install_Result_01", platform: "Google Ads", market: "JP", language: "日语", optimizationEvent: "Install", bidding: "Maximize Conversions", placements: "默认版位", exclusions: "已安装用户", creativeDirection: "结果前置", assetCount: 6 },
        { id: "demo-build-2", name: "US_Install_UGC_02", platform: "Meta Ads", market: "US", language: "英语", optimizationEvent: "Install", bidding: "Lowest Cost", placements: "Advantage+ placements", exclusions: "已安装用户", creativeDirection: "真实录屏", assetCount: 4 },
        { id: "demo-build-3", name: "GB_Install_Hook_03", platform: "TikTok Ads", market: "GB", language: "英语", optimizationEvent: "Install", bidding: "Maximum Delivery", placements: "自动版位", exclusions: "已安装用户", creativeDirection: "痛点反转", assetCount: 4 }
      ],
      ad: {
        firstLaunchAssets: 14,
        totalAssets: 24,
        splitRule: "先按素材方向拆分；表现差异明确后再拆国家、语言或媒体",
        iterationMetrics: "CTR、CVR、AF-CPI 与安装后事件率",
        reportingMetrics: "花费、媒体安装、AF 安装、媒体 CPI、AF-CPI、D1 留存"
      },
      notes: "演示数据，仅展示可导出的搭建结构。"
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
      dateQuality: demoDateQuality(),
      numericQuality: demoNumericQuality(),
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

function normalizeAiMode(mode, { staticDemo = false, cliAllowed = true } = {}) {
  if (staticDemo) return "mock";
  if (mode === "api") return "api";
  if (cliAllowed && (mode === "codex" || mode === "grok")) return mode;
  return "mock";
}

function isLiveAiMode(mode = state.aiMode) {
  return mode === "api" || mode === "grok" || mode === "codex";
}

function isLiveProviderMode(mode) {
  return mode === "api" || mode === "grok" || mode === "codex";
}

function isCliProviderMode(mode) {
  return mode === "grok" || mode === "codex";
}

function initialState() {
  const demo = createDemoProject();
  return {
    activeProjectId: demo.id,
    aiMode: "grok",
    apiPreferences: defaultApiPreferences(),
    mappingProfiles: [],
    projects: [demo]
  };
}

function normalizeStoredState(stored) {
  const projects = stored.projects.map((project) => {
    const normalizedProject = {
      ...project,
      stage: normalizeProjectStage(project.stage),
      performanceTargets: normalizePerformanceTargets(project),
      targetReview: String(project.targetReview || ""),
      intake: createIntake(project.intake || {}),
      launch: createLaunch(project.launch || {}),
      experiments: createExperiments(project.experiments || {}),
      optimizationHistory: projectOptimizationHistory(project),
      strategy: normalizeBuildStrategy(project)
    };
    syncCreativeProduction(normalizedProject);
    return normalizedProject;
  });
  return {
    ...stored,
    activeProjectId: projects.some((project) => project.id === stored.activeProjectId)
      ? stored.activeProjectId
      : projects[0].id,
    aiMode: normalizeAiMode(stored.aiMode),
    apiPreferences: normalizeApiPreferences(stored.apiPreferences),
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
const isCliRuntime = location.hostname === "127.0.0.1" || location.hostname === "localhost";
state.aiMode = normalizeAiMode(state.aiMode, { staticDemo: isStaticDemo, cliAllowed: isCliRuntime });
apiSession = { ...apiSession, ...normalizeApiPreferences(state.apiPreferences) };
apiRoutes = publicApiRoutes(apiSession);

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
  if (value === "experiments") return "optimize";
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

function routesForMode(mode = state.aiMode) {
  if (mode === "codex") return codexRoutes;
  if (mode === "grok") return grokRoutes;
  if (mode === "api") return apiRoutes;
  return aiRoutes;
}

function applyRoutesForMode(mode = state.aiMode) {
  aiRoutes = routesForMode(mode);
  return aiRoutes;
}

function routeSummary(routeKey) {
  const config = routesForMode()[routeKey] || {};
  return `${modelVariantName(config.model)} · ${effortLabel(config.effort)}`;
}

function routeDetail(routeKey) {
  const config = routesForMode()[routeKey] || {};
  return modelRouteDetail(config.model, effortLabel(config.effort));
}

function runRecordLabel(record) {
  if (!record) return "";
  if (record.source === "mock" || !record.source) return "演示结果";
  const details = [modelFullName(record.model)];
  if (record.reasoningEffort) details.push(`推理：${effortLabel(record.reasoningEffort)}`);
  if (record.durationMs) details.push(formatDuration(record.durationMs));
  if (record.fallbackUsed) details.push("自动复核");
  if (record.source === "grok") return `本机 Grok · ${details.join(" · ")}`;
  if (record.source === "codex") return `本机 Codex · ${details.join(" · ")}`;
  if (record.source === "api") return `${apiProtocolLabel(record.protocol || record.provider)} · ${details.join(" · ")}`;
  return details.join(" · ");
}

function displayRouteLabel(label) {
  return String(label || "正在生成")
    .replaceAll("Strategy v0", "策略初稿")
    .replaceAll("Launch Pack", "上线执行")
    .replaceAll("Experiment Ledger", "实验账本")
    .replaceAll("Mock ", "演示")
    .replaceAll("Codex ", "");
}

function renderAiJobPanel() {
  if (!currentAiJob) {
    aiJobPanel.hidden = true;
    return;
  }
  const config = routesForMode()[currentAiJob.routeKey] || {};
  const live = currentAiJob.live || {};
  aiJobPanel.hidden = false;
  aiJobLabel.textContent = displayRouteLabel(live.label || config.label || "正在生成");
  const runtimeLabel = state.aiMode === "api" ? `${apiProtocolLabel(apiSession.protocol)} · 当前会话` : "本机 CLI";
  aiJobMeta.textContent = `${modelFullName(live.model || config.model)} · 推理：${effortLabel(live.effort || config.effort)}${live.fallbackUsed ? " · 结构校验后自动复核中" : ""} · ${runtimeLabel}`;
  aiJobElapsed.textContent = formatClock(Date.now() - currentAiJob.startedAt);
  aiJobExpected.textContent = expectedLabel(config.expectedSeconds);
  aiCancelButton.disabled = currentAiJob.cancelling;
  aiCancelButton.textContent = currentAiJob.cancelling ? "正在取消…" : "取消生成";
}

async function syncActiveAiJob() {
  if (!currentAiJob || isStaticDemo || state.aiMode === "api") return;
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
  currentAiJob = {
    routeKey,
    startedAt: Date.now(),
    cancelling: false,
    abortController: state.aiMode === "api" ? new AbortController() : null
  };
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
    runtimeKind = payload.runtime || (isCliRuntime ? "local" : "cloud");
    const versionWarning = runtimeVersionWarning(APP_VERSION, payload.version);
    if (versionWarning) showPersistentError(versionWarning);
    const labelize = (base, incoming) => {
      const merged = { ...base, ...(incoming || {}) };
      for (const [key, route] of Object.entries(merged)) {
        if (route && typeof route === "object") {
          merged[key] = { ...route, label: displayRouteLabel(route.label || base[key]?.label || key) };
        }
      }
      return merged;
    };
    if (payload.routes) grokRoutes = labelize(DEFAULT_GROK_ROUTES, payload.routes);
    if (payload.codexRoutes) codexRoutes = labelize(DEFAULT_CODEX_ROUTES, payload.codexRoutes);
    else if (payload.routes && !payload.defaultLiveProvider) {
      // Older servers only returned Codex routes under `routes`.
      codexRoutes = labelize(DEFAULT_CODEX_ROUTES, payload.routes);
    }
    runtimeProviders = payload.providers && typeof payload.providers === "object" ? payload.providers : {};
    if (state.aiMode === "codex" && runtimeProviders.codex?.available === false) {
      showPersistentError(runtimeProviders.codex.error || "本机未检测到 Codex CLI，请重启 OpenAdOps 后重试。");
    }
    applyRoutesForMode();
  } catch {
    // Local defaults remain usable if the health endpoint is temporarily unavailable.
  }
}

async function cancelAiJob() {
  if (!currentAiJob || currentAiJob.cancelling) return;
  currentAiJob.cancelling = true;
  renderAiJobPanel();
  if (state.aiMode === "api" && currentAiJob.abortController) {
    currentAiJob.abortController.abort();
    showToast("已取消当前 API 请求");
    return;
  }
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

function dataQualityNotice(project) {
  if (!dataQualityNeedsAttention(project.data)) return "";
  return `<div class="data-quality-notice"><strong>数据质量提示</strong><span>${escapeHtml(dataQualityText(project.data))}</span></div>`;
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
  const mode = isLiveAiMode() ? routeDetail(routeKey) : "本地演示 · 不耗额度";
  const title = stage === "creative" ? "生成素材方向" : "结构化判断";
  const action = stage === "creative" ? "生成素材方向" : "生成分析";
  const mockAction = stage === "creative" ? "生成演示方向" : "运行演示分析";
  return `<div class="analysis-toolbar">
    <div><strong>${title}</strong><span>${escapeHtml(mode)}</span></div>
    <button class="button button-primary" data-run-ai="${attr(stage)}" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在分析…" : isLiveAiMode() ? action : mockAction}</button>
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
        <div class="card-header"><div><h2>投放前策略清单</h2><p>由优化师确认上线阻塞与可带假设项</p></div><div class="inline-actions"><span class="badge question-badge">${questions.length} 项</span>${questions.length ? `<button class="button button-ghost button-small" data-copy-preflight>复制策略清单</button>` : ""}</div></div>
        ${questions.length ? `<div class="question-list">${questions.map((item, index) => `<article class="question-item"><span>${String(index + 1).padStart(2, "0")}</span><div><div class="question-top"><strong>${escapeHtml(item.question)}</strong><em class="${attr(item.priority)}">${item.priority === "required" ? "上线阻塞" : "可带假设"}</em></div><p>${escapeHtml(item.reason)}</p></div></article>`).join("")}</div>` : `<div class="success-note">投放前关键口径已覆盖，可由优化师复核后采用策略初稿。</div>`}
      </section>
      <section class="card strategy-v0-hero">
        <div class="card-header"><div><h2>策略初稿</h2><p>带假设的前期策略草案，不等同于最终上线配置</p></div><span class="card-label">工作草案</span></div>
        <blockquote>${escapeHtml(draft.positioning)}</blockquote>
        <div class="assumption-list"><strong>工作假设</strong>${draft.working_assumptions.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-header"><div><h2>媒体角色与预算场景</h2><p>只对入选媒体给出角色；预算缺失时不生成虚假金额</p></div><button class="button button-primary button-small" data-adopt-intake>采用到搭建策略</button></div>
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
  const mode = isLiveAiMode()
    ? `智能路由 · 投前清单：${routeSummary("intakeQuestions")} ｜ 策略初稿：${routeSummary("intakeStrategy")} ｜ 深度复核：${routeSummary("intakeDeep")}`
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
          <button class="button button-ghost" data-run-intake="questions" ${aiBusy ? "disabled" : ""}>${aiBusy ? "处理中…" : "生成投前清单"}</button>
          <button class="button button-ghost" data-run-intake="deep" ${aiBusy ? "disabled" : ""}>${aiBusy ? "请稍候…" : "深度复核"}</button>
          <button class="button button-primary" data-run-intake="strategy" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : isLiveAiMode() ? "生成策略初稿" : "生成演示策略"}</button>
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
  const hasStrategy = buildStrategyDecisionComplete(project);
  const hasCreative = Boolean(creativeTasks(project).length);
  const launchPack = project.launch?.pack?.result;
  const launchReady = Boolean(launchPack);
  const hasOptimize = Boolean(project.data?.metrics && (project.ai?.optimize || project.ai?.strategy));
  return `${pageHeader("项目总览", project.name, "")}
    ${metricCards(project)}
    <div class="grid overview-grid mb-16">
      <section class="card">
        <div class="card-header"><div><h2>全链路进度</h2></div><button class="button button-primary button-small" data-go-route="report">查看报告</button></div>
        <div class="stage-flow">
          <button type="button" class="stage-step ${hasIntake ? "complete" : ""}" data-step="00" data-go-route="intake"><h3>需求接收</h3><p>资料、投前清单与策略初稿</p></button>
          <button type="button" class="stage-step ${hasStrategy ? "complete" : ""}" data-step="01" data-go-route="strategy"><h3>搭建策略</h3><p>可选 · Campaign / Ad group / Ad</p></button>
          <button type="button" class="stage-step ${hasCreative ? "complete" : ""}" data-step="02" data-go-route="creative"><h3>素材需求</h3><p>制作要求、参考与交付规格</p></button>
          <button type="button" class="stage-step ${launchReady ? "complete" : ""}" data-step="03" data-go-route="launch"><h3>上线执行</h3><p>上线检查、监测与首周行动</p></button>
          <button type="button" class="stage-step ${hasOptimize ? "complete" : ""}" data-step="04" data-go-route="optimize"><h3>投放优化</h3><p>数据诊断与动作</p></button>
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

function buildStrategyModeControl(strategy) {
  const status = strategy.enabled === true ? "需要搭建策略" : strategy.enabled === false ? "无需单独搭建策略" : "尚未选择";
  return `<section class="card build-strategy-mode mb-16">
    <div><span class="card-label">本项目是否需要单独搭建策略</span><strong>${escapeHtml(status)}</strong></div>
    <div class="mode-switch" role="group" aria-label="搭建策略状态">
      <button type="button" class="mode-switch-btn ${strategy.enabled === false ? "active" : ""}" data-build-strategy-enabled="false">无需单独搭建</button>
      <button type="button" class="mode-switch-btn ${strategy.enabled === true ? "active" : ""}" data-build-strategy-enabled="true">需要搭建策略</button>
    </div>
  </section>`;
}

function buildAdGroupCard(project, group, index) {
  const field = (name) => `data-build-adgroup-id="${attr(group.id)}" data-build-adgroup-field="${name}"`;
  const platformOptions = [...new Set([...(project.platforms || []), group.platform].filter(Boolean))]
    .map((platform) => `<option value="${attr(platform)}" ${platform === group.platform ? "selected" : ""}>${escapeHtml(platform)}</option>`)
    .join("");
  return `<article class="build-adgroup-card">
    <div class="build-adgroup-header"><div><span class="card-label">AD GROUP ${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(group.name || "未命名 Ad group")}</strong></div><button type="button" class="button button-ghost button-small" data-remove-build-adgroup="${attr(group.id)}">删除</button></div>
    <div class="form-grid build-adgroup-grid">
      <label class="field"><span>Ad group 名称</span><input ${field("name")} value="${attr(group.name)}" placeholder="例如：BR_Android_Deposit_01" /></label>
      <label class="field"><span>媒体</span><select ${field("platform")}>${platformOptions}</select></label>
      <label class="field"><span>市场</span><input ${field("market")} value="${attr(group.market)}" placeholder="例如：BR, VN" /></label>
      <label class="field"><span>语言</span><input ${field("language")} value="${attr(group.language)}" placeholder="例如：葡语 / 越南语" /></label>
      <label class="field"><span>优化事件</span><input ${field("optimizationEvent")} value="${attr(group.optimizationEvent)}" placeholder="例如：Purchase / First Deposit" /></label>
      <label class="field"><span>素材数量</span><input type="number" min="0" ${field("assetCount")} value="${attr(group.assetCount)}" /></label>
      <label class="field"><span>出价方式</span><input ${field("bidding")} value="${attr(group.bidding)}" placeholder="例如：Lowest Cost / 自动出价" /></label>
      <label class="field"><span>版位</span><input ${field("placements")} value="${attr(group.placements)}" /></label>
      <label class="field field-wide"><span>素材方向</span><textarea ${field("creativeDirection")} placeholder="本组只写可执行的素材方向，不写产品卖点。">${escapeHtml(group.creativeDirection)}</textarea></label>
      <label class="field field-wide"><span>排除条件</span><textarea ${field("exclusions")} placeholder="例如：已安装用户、已付费用户、不投市场。">${escapeHtml(group.exclusions)}</textarea></label>
    </div>
  </article>`;
}

function renderStrategy(project) {
  const strategy = ensureBuildStrategy(project, { makeId });
  const actions = strategy.enabled === true
    ? `<button class="button button-primary" data-export-build-strategy-xlsx>导出 Excel</button>`
    : "";
  if (strategy.enabled !== true) {
    const message = strategy.enabled === false
      ? "本项目已标记为无需单独搭建策略，可直接进入素材需求或上线执行。"
      : "先判断项目是否需要给客户单独输出 Campaign、Ad group 与 Ad 搭建表。";
    return `${pageHeader("阶段 01 · 搭建策略", "搭建策略", "可选模块", actions)}
      ${buildStrategyModeControl(strategy)}
      <section class="card build-strategy-empty">${emptyState(strategy.enabled === false ? "无需单独搭建策略" : "尚未选择", message, strategy.enabled === false ? "creative" : "", strategy.enabled === false ? "进入素材需求" : "")}</section>`;
  }

  return `${pageHeader("阶段 01 · 搭建策略", "搭建策略", "Campaign、Ad group 与 Ad 的可执行搭建表", actions)}
    ${buildStrategyModeControl(strategy)}
    <section class="card mb-16">
      <div class="card-header"><div><h2>Campaign 基础</h2></div><span class="card-label">CAMPAIGN</span></div>
      <div class="form-grid build-campaign-grid">
        <label class="field"><span>目标市场</span><input data-project-field="markets" value="${attr(project.markets)}" /></label>
        <label class="field"><span>项目阶段</span><select data-project-field="stage">${PROJECT_STAGES.map((value) => `<option ${project.stage === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label class="field"><span>主要目标</span><select data-project-field="goal">${[["Install", "安装"], ["Registration", "注册"], ["Purchase", "付费"], ["ROAS", "ROAS"]].map(([value, label]) => `<option value="${value}" ${project.goal === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="field"><span>归因来源</span><select data-project-field="attribution">${["AppsFlyer", "Adjust", "媒体后台", "GA4"].map((value) => `<option ${project.attribution === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label class="field"><span>月预算</span><input type="number" step="1" data-project-field="budget" value="${attr(project.budget)}" /></label>
        <label class="field"><span>操作系统</span><input data-project-field="strategy.campaign.os" value="${attr(strategy.campaign.os)}" placeholder="Android / iOS" /></label>
        <label class="field"><span>Campaign 命名</span><input data-project-field="strategy.campaign.name" value="${attr(strategy.campaign.name)}" /></label>
        <label class="field"><span>语言</span><input data-project-field="strategy.campaign.language" value="${attr(strategy.campaign.language)}" /></label>
        <label class="field field-wide"><span>商店链接</span><input data-project-field="strategy.campaign.storeUrl" value="${attr(strategy.campaign.storeUrl)}" placeholder="App Store / Google Play URL" /></label>
        <label class="field"><span>主要事件</span><input data-project-field="strategy.campaign.primaryEvent" value="${attr(strategy.campaign.primaryEvent)}" /></label>
        <label class="field"><span>辅助事件</span><input data-project-field="strategy.campaign.supportingEvents" value="${attr(strategy.campaign.supportingEvents)}" /></label>
        <label class="field"><span>出价方式</span><input data-project-field="strategy.campaign.bidStrategy" value="${attr(strategy.campaign.bidStrategy)}" placeholder="自动出价 / Lowest Cost / tCPA" /></label>
        <label class="field"><span>版位</span><input data-project-field="strategy.campaign.placements" value="${attr(strategy.campaign.placements)}" /></label>
        <label class="field field-wide"><span>排除条件</span><input data-project-field="strategy.campaign.exclusions" value="${attr(strategy.campaign.exclusions)}" placeholder="已安装、已付费、不投市场等" /></label>
        ${performanceTargetEditor(project)}
      </div>
    </section>
    <section class="card mb-16"><div class="card-header"><div><h2>媒体预算</h2></div><span class="card-label">TOTAL ${project.platforms.reduce((sum, platform) => sum + Number(strategy.budgetShares?.[platform] || 0), 0)}%</span></div>
      <div class="grid grid-3">${project.platforms.map((platform) => `<label class="field"><span>${escapeHtml(platform)} 占比</span><input type="number" min="0" max="100" data-budget-platform="${attr(platform)}" value="${attr(strategy.budgetShares?.[platform] ?? Math.round(100 / project.platforms.length))}" /></label>`).join("")}</div>
    </section>
    <section class="card mb-16">
      <div class="card-header"><div><h2>Ad group 搭建矩阵</h2></div><button type="button" class="button button-secondary button-small" data-add-build-adgroup>＋ 添加 Ad group</button></div>
      <div class="build-adgroup-list">${strategy.adGroups.map((group, index) => buildAdGroupCard(project, group, index)).join("")}</div>
    </section>
    <section class="card mb-16">
      <div class="card-header"><div><h2>Ad 与复盘规则</h2></div><span class="card-label">AD / REVIEW</span></div>
      <div class="form-grid two-columns">
        <label class="field"><span>首发素材数</span><input type="number" min="0" data-project-field="strategy.ad.firstLaunchAssets" value="${attr(strategy.ad.firstLaunchAssets)}" /></label>
        <label class="field"><span>素材池总量</span><input type="number" min="0" data-project-field="strategy.ad.totalAssets" value="${attr(strategy.ad.totalAssets)}" /></label>
        <label class="field field-wide"><span>拆分规则</span><textarea data-project-field="strategy.ad.splitRule">${escapeHtml(strategy.ad.splitRule)}</textarea></label>
        <label class="field"><span>迭代指标</span><textarea data-project-field="strategy.ad.iterationMetrics">${escapeHtml(strategy.ad.iterationMetrics)}</textarea></label>
        <label class="field"><span>汇报指标</span><textarea data-project-field="strategy.ad.reportingMetrics">${escapeHtml(strategy.ad.reportingMetrics)}</textarea></label>
        <label class="field field-wide"><span>特殊限制</span><textarea data-project-field="strategy.notes">${escapeHtml(strategy.notes)}</textarea></label>
      </div>
    </section>`;
}

function creativeTaskRow(task, index) {
  const taskId = attr(task.id);
  const field = (name) => `data-creative-task-id="${taskId}" data-creative-task-field="${name}"`;
  return `<article class="creative-demand-row">
    <div class="creative-demand-index"><strong>${String(index + 1).padStart(2, "0")}</strong><button type="button" class="creative-demand-remove" data-remove-creative-task="${taskId}" aria-label="删除素材 ${String(index + 1).padStart(2, "0")}">×</button></div>
    <label class="field"><span>素材参考</span><textarea ${field("assetReference")} placeholder="由优化师填写链接、文件名或说明；AI 留空">${escapeHtml(task.assetReference)}</textarea></label>
    <label class="field"><span>文案</span><textarea ${field("copy")} placeholder="口播、字幕或 CTA；没有可留空">${escapeHtml(task.copy)}</textarea></label>
    <label class="field"><span>修改要求</span><textarea ${field("modificationNotes")} placeholder="人物、镜头、字幕、尾板、节奏等">${escapeHtml(creativeRequirementInstructions(task))}</textarea></label>
    <div class="creative-demand-delivery">
      <label class="field"><span>规格</span><input ${field("format")} value="${attr(task.format)}" placeholder="9:16 · 15 秒" /></label>
      <label class="field"><span>数量</span><input type="number" min="1" max="100" ${field("quantity")} value="${attr(task.quantity ?? "")}" placeholder="数量待定" /></label>
    </div>
  </article>`;
}

function creativeGuidance(result) {
  if (!result?.guidance?.length) return "";
  const labels = { required: "必须遵守", recommended: "建议采用", confirm: "待人工确认" };
  return `<section class="creative-guidance"><div class="card-header"><div><h2>素材需求分析</h2><p>${escapeHtml(result.executive_summary)}</p></div><span class="badge">${result.guidance.length} 项</span></div>
    <div class="creative-guidance-list">${result.guidance.map((item) => `<article class="creative-guidance-item creative-guidance-${attr(item.status)}"><span>${escapeHtml(labels[item.status] || item.status)}</span><strong>${escapeHtml(item.item)}</strong><p>${escapeHtml(item.reason)}</p></article>`).join("")}</div>
  </section>`;
}

function creativeSuggestions(project, production) {
  const suggestions = production.analysis?.result?.suggestions || [];
  if (!suggestions.length) return "";
  const adopted = new Set(production.tasks.map((item) => item.sourceKey));
  return `<section class="creative-suggestions">
    <div class="card-header"><div><h2>可采纳需求</h2><p>只采纳有用的行，不会自动覆盖正式需求。</p></div><button type="button" class="button button-secondary button-small" data-adopt-all-creative>采纳全部</button></div>
    <div class="creative-suggestion-table"><div class="creative-suggestion-head"><span>素材参考</span><span>文案</span><span>修改要求</span><span>规格 / 数量</span><span></span></div>${suggestions.map((item) => {
      const isAdopted = adopted.has(`creative_requirement:${item.id}`);
      return `<article class="creative-suggestion-row"><p class="creative-reference-placeholder">AI 暂不提供素材参考</p><p>${escapeHtml(item.copy || "—")}</p><p>${escapeHtml(item.modification_notes)}</p><p>${escapeHtml(item.format || "规格待定")} · ${item.quantity ?? "数量待定"}</p><span class="creative-suggestion-action"><button type="button" class="button ${isAdopted ? "button-ghost" : "button-secondary"} button-small" data-adopt-creative="${attr(item.id)}" ${isAdopted ? "disabled" : ""}>${isAdopted ? "已采纳" : "采纳"}</button></span></article>`;
    }).join("")}</div>
  </section>`;
}

function creativeAiDrawer(production) {
  if (!creativeAiPanelOpen) return "";
  return `<div class="creative-ai-backdrop" data-close-creative-ai></div>
    <aside class="creative-ai-drawer" role="dialog" aria-modal="true" aria-label="AI 素材建议">
      <header class="creative-ai-drawer-header"><div><span class="card-label">AI 辅助</span><h2>AI 素材建议</h2><p>分析上游信息，提示制作边界并补充可执行需求。</p></div><button type="button" class="creative-ai-close" data-close-creative-ai aria-label="关闭 AI 素材建议">×</button></header>
      <div class="creative-ai-drawer-body">
        <label class="field field-wide"><span>补充要求（仅供 AI 分析）</span><textarea data-creative-workspace-field="notes" placeholder="例如：重点检查 Meta 软情色素材边界，并补充 3 条可执行需求">${escapeHtml(production.notes)}</textarea></label>
        <div class="creative-runbar"><span>${escapeHtml(isLiveAiMode() ? routeDetail("creativeRequirements") : "本地演示 · 不耗额度")}</span><button class="button button-primary" data-run-creative-requirements type="button" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : "生成素材建议"}</button></div>
        ${production.analysis?.result ? creativeGuidance(production.analysis.result) : `<div class="creative-ai-empty"><strong>还没有建议</strong><p>AI 会读取上游项目、统一要求和这里的补充重点。</p></div>`}
        ${production.analysis?.result ? creativeSuggestions(null, production) : ""}
      </div>
    </aside>`;
}

function renderCreative(project) {
  const production = normalizeCreativeProduction(project, { makeId });
  const tasks = production.tasks;
  const market = project.markets || briefFieldValue(project.intake?.analysis?.result, "markets") || "待确认";
  const platform = (project.platforms || []).join(" / ") || "待确认";
  const actions = `<button class="button button-ghost" data-copy-creative-feishu type="button" ${tasks.length ? "" : "disabled"}>复制飞书表格</button><button class="button button-secondary" data-add-creative-task type="button">＋ 手动新增</button><button class="button button-primary" data-open-creative-ai type="button">${aiBusy ? "正在生成…" : "AI 生成素材建议"}</button>`;
  return `${pageHeader("阶段 02 · 素材需求", "素材需求", "", actions)}
    <section class="card mb-16">
      <div class="card-header"><div><h2>素材需求单</h2><p>${escapeHtml(project.name || "未命名项目")} · ${escapeHtml(platform)} · ${escapeHtml(market)}</p></div><span class="badge" style="color:var(--accent-deep);background:var(--accent-soft)">${tasks.length} 条</span></div>
      <details class="creative-global-details" ${production.commonRequirements ? "open" : ""}><summary><span>给设计的统一要求（可选）</span><em>仅作全局备注</em></summary><label class="field field-wide creative-common-requirements"><span>适用于本表全部素材，不会作为素材行复制</span><textarea data-creative-workspace-field="commonRequirements" placeholder="例如：使用目标市场成年人物、统一品牌尾板、避免敏感表达；没有可留空">${escapeHtml(production.commonRequirements)}</textarea></label></details>
      ${tasks.length ? `<div class="creative-demand-table"><div class="creative-demand-head"><span>素材编号</span><span>素材参考</span><span>文案</span><span>修改备注</span><span>数量需求</span></div>${tasks.map((task, index) => creativeTaskRow(task, index)).join("")}</div>` : emptyState("还没有素材需求", "手动新增，或让 AI 生成可采纳的需求建议。", "", "")}
    </section>
    ${creativeAiDrawer(production)}`;
}

function launchPackRecord(project) {
  return project.launch?.pack || null;
}

function launchStatusText(status) {
  return ({ ready: "可上线", conditional: "有条件上线", blocked: "暂不可上线", needs_confirmation: "待确认", blocker: "阻塞项" })[status] || status;
}

function launchGateCategoryText(category) {
  return ({
    strategy: "策略",
    tracking: "追踪",
    campaign: "搭建",
    creative: "素材",
    operations: "执行",
    compliance: "合规"
  })[category] || category;
}

function launchBudgetText(item) {
  if (item.budget_amount === null) return "待确认";
  if (Number(item.budget_amount) === 0) return "本轮暂缓";
  return formatMetric(item.budget_amount, "currency", item.currency);
}

function renderLaunchExecutionSummary(project) {
  const strategy = normalizeBuildStrategy(project, { makeId });
  const production = normalizeCreativeProduction(project, { makeId });
  const bidding = strategy.campaign.bidStrategy
    || [...new Set(strategy.adGroups.map((item) => item.bidding).filter(Boolean))].join(" / ")
    || "待确认";
  const buildStatus = strategy.enabled === false
    ? "无需单独搭建策略"
    : strategy.enabled === true
      ? `${strategy.adGroups.length} 个 Ad group`
      : "待确认";
  const items = [
    ["媒体", project.platforms.join(" / ") || "待确认"],
    ["市场", project.markets || "待确认"],
    ["搭建策略", buildStatus],
    ["优化事件", strategy.campaign.primaryEvent || project.goal || "待确认"],
    ["出价", bidding],
    ["月预算", Number(project.budget) > 0 ? formatMetric(project.budget, "currency", project.currency) : "待确认"],
    ["素材需求", production.tasks.length ? `${production.tasks.length} 条` : "待补充"],
    ["归因口径", project.attribution || "待确认"]
  ];
  return `<section class="card"><div class="card-header"><div><h2>上线摘要</h2><p>只读取前面已经确认的配置，不重新生成策略</p></div><span class="card-label">上游结果</span></div><div class="launch-execution-summary">${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></section>`;
}

function renderLaunchPackResult(project) {
  const record = launchPackRecord(project);
  const pack = record?.result;
  if (!pack) {
    return `<div class="launch-pack-stack">
      ${renderLaunchExecutionSummary(project)}
      <section class="card launch-empty-card launch-checklist-empty"><div class="launch-empty-copy"><span class="card-label">策略 / 素材 → 上线</span><h2>生成第一份上线执行清单</h2><p>检查账户、归因、素材与合规阻塞，并生成 Day 0–7 操作规则。</p></div></section>
    </div>`;
  }

  const readiness = pack.readiness;
  const pendingItems = pack.launch_checklist.filter((item) => item.status !== "ready");
  const readinessSummary = readiness.status === "blocked"
    ? `存在 ${readiness.blockers.length} 个上线阻塞项，关闭前不得正式花费。`
    : readiness.status === "conditional"
      ? `当前没有硬阻塞，但仍有 ${pendingItems.length} 项需要人工确认。`
      : "所有上线检查项均已确认，正式花费前仍需负责人最终复核。";
  const sourceLabel = runRecordLabel(record);
  const statusOptions = (current) => ["ready", "needs_confirmation", "blocker"].map((status) => `<option value="${status}" ${status === current ? "selected" : ""}>${launchStatusText(status)}</option>`).join("");
  return `<div class="launch-pack-stack">
    <section class="launch-readiness ${attr(readiness.status)}">
      <div class="readiness-state"><span>上线状态</span><strong>${escapeHtml(launchStatusText(readiness.status))}</strong></div>
      <div class="readiness-copy"><span class="card-label">${escapeHtml(sourceLabel)} · ${dateText(record.generatedAt)}</span><h2>上线执行清单</h2><p>${escapeHtml(readinessSummary)}</p></div>
      <div class="readiness-blockers"><span>待处理</span><strong>${pendingItems.length}</strong><small>${pendingItems.length ? escapeHtml(pendingItems[0].item) : "当前没有未关闭检查项"}</small></div>
    </section>

    ${renderLaunchExecutionSummary(project)}

    <div class="grid launch-measurement-grid">
      <section class="card"><div class="card-header"><div><h2>监测与归因</h2><p>媒体反馈、MMP 和业务结果分层使用</p></div><span class="card-label">监测口径</span></div><div class="measurement-hero"><span>最终口径</span><strong>${escapeHtml(pack.measurement.source_of_truth)}</strong></div>${renderStrategyList("主要与辅助事件", [pack.measurement.primary_event, ...pack.measurement.supporting_events])}${renderStrategyList("归因规则", pack.measurement.attribution_rules)}${renderStrategyList("追踪检查", pack.measurement.tracking_checklist)}</section>
      <section class="card"><div class="card-header"><div><h2>Day 0–7 行动</h2></div><span class="card-label">上线首周</span></div><div class="launch-week">${pack.first_7_days.map((item) => `<article><span>${escapeHtml(item.period)}</span><div>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<strong>${escapeHtml(item.decision_rule)}</strong></div></article>`).join("")}</div></section>
    </div>

    <section class="card">
      <div class="card-header"><div><h2>上线检查</h2><p>人工更新状态；任何阻塞项未关闭时不得正式花费</p></div><span class="card-label">负责人 × 证据</span></div>
      <div class="table-wrap"><table class="launch-gate-table"><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${pack.launch_checklist.map((item) => `<tr><td><span class="gate-category">${escapeHtml(launchGateCategoryText(item.category))}</span></td><td><strong>${escapeHtml(item.item)}</strong></td><td><select class="gate-status ${attr(item.status)}" data-launch-status="${attr(item.id)}">${statusOptions(item.status)}</select></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.evidence)}</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}

function renderLaunch(project) {
  const mode = isLiveAiMode() ? routeDetail("launchPack") : "本地演示 · 不耗额度";
  return `${pageHeader("阶段 03 · 上线执行", "上线执行", "", "")}
    <section class="card launch-runbar mb-16"><div><strong>生成上线检查与首周动作</strong><span>${escapeHtml(mode)} · 不改广告账户</span></div><button class="button button-primary" data-run-launch-pack ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : isLiveAiMode() ? "生成上线清单" : "生成演示清单"}</button></section>
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
      <div><span class="card-label">上线执行 → 学习沉淀</span><h2>建立第一份实验账本</h2><p>生成实验队列、样本门槛和结果记录模板。</p></div>
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
  const mode = isLiveAiMode() ? routeDetail("experiments") : "本地演示 · 不耗额度";
  return `${pageHeader("阶段 04 · 实验台", "实验台", "", actions)}
    <section class="card experiment-runbar mb-16"><div><strong>本页主操作</strong><span>${escapeHtml(mode)} · 只规划记录，不创建后台实验</span></div><button class="button button-primary" data-run-experiments ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : isLiveAiMode() ? "生成实验账本" : "生成演示实验账本"}</button></section>
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
  if (change.trend === "unavailable") return `<span class="comparison-change neutral">不可计算</span>`;
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

const OPTIMIZATION_ACTION_CATEGORY_LABELS = {
  creative: "素材",
  tracking: "归因 / 回传",
  experiment: "实验",
  budget: "预算",
  bidding: "出价",
  structure: "结构",
  other: "其他"
};

const OPTIMIZATION_ACTION_METRIC_TYPES = {
  spend: "currency",
  installs: "number",
  af_installs: "number",
  cpi: "currency",
  afCpi: "currency",
  conversions: "number",
  cpa: "currency",
  roas: "ratio",
  d1Retention: "percent",
  revenue: "currency"
};

function optimizationStatusText(status) {
  return OPTIMIZATION_STATUS_LABELS[status] || "待复核";
}

function optimizationActionCategoryText(category) {
  return OPTIMIZATION_ACTION_CATEGORY_LABELS[category] || "其他";
}

function optimizationActionTransferLabel(category) {
  return ({
    creative: "转为素材需求",
    tracking: "加入上线检查"
  })[category] || "";
}

function optimizationActionEvidence(project, run, action) {
  const currentData = project.data || {};
  const hasNewImport = Boolean(
    currentData.importedAt
      && run.dataContext?.importedAt
      && currentData.importedAt !== run.dataContext.importedAt
  );
  if (!hasNewImport) return `<span class="action-evidence-waiting">等待下一周期数据</span>`;
  const change = actionMetricChange(action, run.dataContext?.summary, currentData.metrics?.summary);
  if (!change.available) return `<span class="action-evidence-waiting">${escapeHtml(change.reason)}</span>`;
  const type = OPTIMIZATION_ACTION_METRIC_TYPES[change.metric.key] || "number";
  const movement = change.relativeChange === null
    ? "基期为 0"
    : change.relativeChange === 0
      ? "持平"
      : `${change.relativeChange > 0 ? "+" : ""}${change.relativeChange.toFixed(2)}%`;
  return `<div class="action-evidence-change"><span>${escapeHtml(change.metric.label)}</span><strong>${formatMetric(change.baseline, type, project.currency)} → ${formatMetric(change.current, type, project.currency)}</strong><em class="${attr(change.trend)}">${escapeHtml(movement)}</em></div>`;
}

function optimizationActionEntries(project) {
  const runs = projectOptimizationHistory(project);
  const latestRunId = runs[0]?.id;
  return runs.flatMap((run) => (run.actions || []).map((action) => ({ run, action })))
    .filter(({ run, action }) => run.id === latestRunId || ["accepted", "executing"].includes(action.status))
    .slice(0, 12);
}

function optimizationActionCard(project, run, action) {
  const categoryOptions = OPTIMIZATION_ACTION_CATEGORIES.map((category) => `<option value="${category}" ${action.category === category ? "selected" : ""}>${escapeHtml(optimizationActionCategoryText(category))}</option>`).join("");
  const statusOptions = OPTIMIZATION_ACTION_STATUSES.map((status) => `<option value="${status}" ${action.status === status ? "selected" : ""}>${escapeHtml(optimizationStatusText(status))}</option>`).join("");
  const transferLabel = optimizationActionTransferLabel(action.category);
  return `<article class="optimization-action-card" data-optimization-action-review="${attr(action.id)}" data-optimization-run-id="${attr(run.id)}">
    <header><div><span>${escapeHtml(optimizationActionCategoryText(action.category))} · ${escapeHtml(optimizationPeriodText(run))}</span><h3>${escapeHtml(action.title)}</h3></div><em class="optimization-status ${attr(action.status)}">${escapeHtml(optimizationStatusText(action.status))}</em></header>
    <div class="optimization-action-context"><div><span>数据证据</span><p>${escapeHtml(action.evidence)}</p></div><div><span>前后变化</span>${optimizationActionEvidence(project, run, action)}</div></div>
    <label class="optimization-action-main"><span>优化动作</span><textarea data-optimization-action-field="action">${escapeHtml(action.action)}</textarea></label>
    <div class="optimization-action-controls">
      <label><span>分类</span><select data-optimization-action-field="category">${categoryOptions}</select></label>
      <label><span>状态</span><select data-optimization-action-field="status">${statusOptions}</select></label>
      <label><span>验证口径</span><input data-optimization-action-field="successMetric" value="${attr(action.successMetric)}" /></label>
      <label class="optimization-action-result"><span>验证结论</span><textarea data-optimization-action-field="resultNote" placeholder="执行结果、是否有效及原因">${escapeHtml(action.resultNote)}</textarea></label>
    </div>
    <footer><span>${action.transferredTo === "experiments" ? "历史测试记录已保留" : action.transferredTo ? `已流转至${escapeHtml(({ creative: "素材需求", launch: "上线执行" })[action.transferredTo] || action.transferredTo)}` : "AI 提建议，优化师决定是否执行"}</span><div>${transferLabel ? `<button class="button button-ghost button-small" type="button" data-transfer-optimization-action="${attr(action.id)}" data-transfer-run-id="${attr(run.id)}">${escapeHtml(transferLabel)}</button>` : ""}<button class="button button-secondary button-small" type="button" data-save-optimization-action="${attr(action.id)}" data-save-action-run-id="${attr(run.id)}">保存动作</button></div></footer>
  </article>`;
}

function optimizationActionsPanel(project) {
  const entries = optimizationActionEntries(project);
  if (!entries.length) return `<section class="card optimization-actions-card mb-16"><div class="card-header"><div><h2>优化动作</h2><p>运行诊断后，将建议逐条确认、执行和验证。</p></div></div><p class="muted">还没有可执行的优化动作。</p></section>`;
  const openCount = entries.filter(({ action }) => !["validated", "rejected"].includes(action.status)).length;
  return `<section class="card optimization-actions-card mb-16">
    <div class="card-header"><div><h2>优化动作</h2><p>逐条确认、流转和验证；系统只计算变化，不替你宣布结论。</p></div><div class="inline-actions"><span class="card-label">${openCount} 项待处理</span><button class="button button-ghost button-small" type="button" data-copy-optimization-feishu>复制飞书复盘</button></div></div>
    <div class="optimization-action-list">${entries.map(({ run, action }) => optimizationActionCard(project, run, action)).join("")}</div>
  </section>`;
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
        <div class="optimization-run-meta"><span>${escapeHtml(runRecordLabel(run))}</span><span>${escapeHtml(optimizationPeriodText(run))}</span>${dataQualityIssues(run.dataContext).length ? `<span>${escapeHtml(dataQualityIssues(run.dataContext).join("；"))}</span>` : ""}</div>
        ${optimizationSnapshot(run, project.currency || "USD")}
        <div class="optimization-review-grid" data-optimization-review="${attr(run.id)}"><label><span>整次复盘备注</span><textarea data-optimization-run-note placeholder="补充本次诊断的整体背景或结论。">${escapeHtml(run.note)}</textarea></label><button class="button button-secondary button-small" type="button" data-save-optimization-review="${attr(run.id)}">保存备注</button></div>
        <div class="optimization-run-content"><div><h3>诊断摘要</h3><p>${escapeHtml(run.result?.executive_summary || "无")}</p></div><div><h3>动作状态</h3><ol>${(run.actions || []).map((action) => `<li><strong>${escapeHtml(action.title)}</strong><span>${escapeHtml(optimizationActionCategoryText(action.category))} · ${escapeHtml(optimizationStatusText(action.status))}${action.resultNote ? ` · ${escapeHtml(action.resultNote)}` : ""}</span></li>`).join("") || "<li>无结构化动作</li>"}</ol></div></div>
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
  return `${pageHeader("阶段 04 · 投放优化", "投放优化", "上传 CSV，由代码计算指标，AI 基于证据判断。")}
    <section class="card mb-16">
      <div class="card-header"><div><h2>数据导入</h2><p>V1 支持 CSV；原始明细仅在当前页面解析，项目只保存聚合指标</p></div>${project.data ? `<span class="badge" style="color:var(--success);background:var(--success-soft)">${escapeHtml(project.data.fileName)}</span>` : ""}</div>
      <div class="drop-zone"><strong>导入媒体 / AppsFlyer 报表</strong><span>支持带引号的 CSV；可手动调整字段映射</span><div class="upload-actions" style="justify-content:center"><label class="button button-secondary">选择 CSV<input id="csvInput" type="file" accept=".csv,text/csv" /></label><button class="button button-ghost" data-load-demo>载入演示 CSV</button></div></div>
      ${mappingPanel()}
    </section>
    ${dataQualityNotice(project)}
    ${metricCards(project)}
    ${periodComparison(project)}
    <div class="grid grid-2 mb-16"><section class="card"><div class="card-header"><div><h2>媒体对比</h2></div></div>${platformTable(project)}</section><section class="card"><div class="card-header"><div><h2>国家效率</h2><p>横条为花费，右侧优先显示 AF-CPI；缺失时显示媒体 CPI</p></div></div>${spendBars(project)}</section></div>
    <section class="card mb-16">${analysisToolbar("optimize")}${aiResult(project, "optimize")}</section>
    ${optimizationActionsPanel(project)}
    ${optimizationHistoryPanel(project)}`;
}

function latestAnalysis(project) {
  return project.ai?.optimize || project.ai?.strategy || project.ai?.creative || null;
}

function optimizationActionTable(project) {
  const actions = projectOptimizationHistory(project)[0]?.actions || [];
  if (!actions.length) return `<p class="muted">运行投放优化诊断后生成下一步动作。</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>问题</th><th>动作</th><th>验证口径</th><th>状态</th><th>验证结论</th></tr></thead><tbody>${actions.map((item) => `<tr><td class="cell-wrap"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.evidence)}</small></td><td class="cell-wrap">${escapeHtml(item.action)}</td><td class="cell-wrap">${escapeHtml(item.successMetric)}</td><td><span class="optimization-status ${attr(item.status)}">${escapeHtml(optimizationStatusText(item.status))}</span></td><td class="cell-wrap">${escapeHtml(item.resultNote || "待验证")}</td></tr>`).join("")}</tbody></table></div>`;
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
      <section class="report-section"><h3>04 · 下一步动作</h3>${optimizationActionTable(project)}</section>
      <section class="report-section"><h3>05 · 优化决策记录</h3>${optimizationDecisionTable(project)}</section>
      <section class="report-section"><h3>06 · 口径说明</h3><div class="project-facts"><div class="fact-row"><span>数据来源</span><strong>${escapeHtml(project.data?.fileName || "未导入")}</strong></div><div class="fact-row"><span>数据质量</span><strong>${escapeHtml(dataQualityText(project.data))}</strong></div><div class="fact-row"><span>归因口径</span><strong>${escapeHtml(project.attribution)}</strong></div><div class="fact-row"><span>分析来源</span><strong>${record ? escapeHtml(runRecordLabel(record)) : "未运行"}</strong></div><div class="fact-row"><span>项目备注</span><strong>${escapeHtml(project.notes || "无")}</strong></div></div></section>
    </article>`;
}

const renderers = { overview: renderOverview, intake: renderIntake, strategy: renderStrategy, creative: renderCreative, launch: renderLaunch, optimize: renderOptimize, report: renderReport };

function refreshShell(project) {
  projectSelect.innerHTML = state.projects.map((item) => `<option value="${attr(item.id)}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  projectSelect.disabled = aiBusy;
  if (aiModeSelect) {
    aiModeSelect.value = state.aiMode;
    aiModeSelect.disabled = aiBusy;
  }
  document.querySelectorAll("[data-ai-mode]").forEach((button) => {
    const active = button.dataset.aiMode === state.aiMode;
    const mode = button.dataset.aiMode;
    const liveMode = isLiveProviderMode(mode);
    const cliUnavailable = isCliProviderMode(mode) && !isCliRuntime;
    const unavailable = runtimeProviders[mode]?.available === false || cliUnavailable;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.disabled = aiBusy || (isStaticDemo && liveMode) || unavailable;
    if (isStaticDemo && liveMode) {
      button.title = "旧版 GitHub Pages 只保留演示，请打开新版 OpenAdOps 网站或下载本地版";
    } else if (cliUnavailable) {
      button.title = "CLI 只能在本地版运行；公网版请使用 API";
    } else if (unavailable) {
      button.title = runtimeProviders[mode]?.error || "当前模式不可用";
    } else {
      button.removeAttribute("title");
    }
  });
  if (apiSettingsButton) {
    apiSettingsButton.hidden = state.aiMode !== "api";
    apiSettingsButton.disabled = aiBusy;
    apiSettingsButton.textContent = apiSession.connected ? `${apiProtocolLabel(apiSession.protocol)} · 已连接` : "API 设置";
  }
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
  document.querySelectorAll("[data-build-strategy-enabled]").forEach((button) => {
    button.addEventListener("click", () => {
      const enabled = button.dataset.buildStrategyEnabled === "true";
      const saved = updateProject((project) => {
        project.strategy = ensureBuildStrategy(project, { makeId });
        project.strategy.enabled = enabled;
        if (enabled && !project.strategy.adGroups.length) {
          project.strategy.adGroups.push(createBuildAdGroup(project, {}, { makeId }));
        }
      });
      render();
      if (saved) showToast(enabled ? "已启用搭建策略" : "已标记为无需单独搭建策略");
    });
  });
  document.querySelectorAll("[data-build-adgroup-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        project.strategy = ensureBuildStrategy(project, { makeId });
        const group = project.strategy.adGroups.find((item) => item.id === input.dataset.buildAdgroupId);
        if (!group) return;
        const field = input.dataset.buildAdgroupField;
        group[field] = field === "assetCount" ? Math.max(0, Number(input.value) || 0) : input.value;
      });
      render();
      if (saved) showToast("Ad group 已更新");
    });
  });
  document.querySelector("[data-add-build-adgroup]")?.addEventListener("click", () => {
    const saved = updateProject((project) => {
      project.strategy = ensureBuildStrategy(project, { makeId });
      project.strategy.enabled = true;
      project.strategy.adGroups.push(createBuildAdGroup(project, {}, { makeId }));
    });
    render();
    if (saved) showToast("已添加 Ad group");
  });
  document.querySelectorAll("[data-remove-build-adgroup]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("删除这条 Ad group？此操作会立即保存。")) return;
      const saved = updateProject((project) => {
        project.strategy = ensureBuildStrategy(project, { makeId });
        project.strategy.adGroups = project.strategy.adGroups.filter((item) => item.id !== button.dataset.removeBuildAdgroup);
      });
      render();
      if (saved) showToast("Ad group 已删除");
    });
  });
  document.querySelectorAll("[data-export-build-strategy-xlsx]").forEach((button) => button.addEventListener("click", exportBuildStrategyXlsx));
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
        task[field] = field === "quantity" ? (input.value === "" ? null : Math.max(1, Number(input.value) || 1)) : input.value;
        if (field === "modificationNotes") {
          task.mustKeep = "";
          task.prohibited = "";
          task.productionNotes = "";
          task.complianceNotes = "";
        }
        task.updatedAt = new Date().toISOString();
        syncCreativeProduction(project, production.tasks);
      });
      render();
      if (saved) showToast("素材需求已更新");
    });
  });
  document.querySelectorAll("[data-creative-workspace-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const saved = updateProject((project) => {
        const production = syncCreativeProduction(project);
        production[input.dataset.creativeWorkspaceField] = input.value;
        project.creativeProduction = production;
      });
      render();
      if (saved) showToast("素材补充已保存");
    });
  });
  document.querySelector("[data-open-creative-ai]")?.addEventListener("click", () => {
    creativeAiPanelOpen = true;
    render();
  });
  document.querySelectorAll("[data-close-creative-ai]").forEach((button) => {
    button.addEventListener("click", () => {
      creativeAiPanelOpen = false;
      render();
    });
  });
  document.querySelector("[data-add-creative-task]")?.addEventListener("click", () => {
    const saved = updateProject((project) => {
      const production = syncCreativeProduction(project);
      production.tasks.push(normalizeCreativeTask({
        source: "manual",
        platform: project.platforms?.[0],
        market: project.markets,
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
    if (saved) showToast("已新增素材需求");
  });
  document.querySelectorAll("[data-remove-creative-task]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("删除这条素材需求？此操作会立即保存。")) return;
      const saved = updateProject((project) => {
        const production = syncCreativeProduction(project);
        syncCreativeProduction(project, production.tasks.filter((task) => task.id !== button.dataset.removeCreativeTask));
      });
      render();
      if (saved) showToast("素材需求已删除");
    });
  });
  document.querySelector("[data-run-creative-requirements]")?.addEventListener("click", runCreativeRequirements);
  document.querySelectorAll("[data-adopt-creative]").forEach((button) => button.addEventListener("click", () => adoptCreativeSuggestions([button.dataset.adoptCreative])));
  document.querySelector("[data-adopt-all-creative]")?.addEventListener("click", () => adoptCreativeSuggestions());
  document.querySelector("[data-copy-creative-feishu]")?.addEventListener("click", copyCreativeRequirementsToFeishu);
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
        note: review.querySelector("[data-optimization-run-note]")?.value || ""
      });
    });
  });
  document.querySelectorAll("[data-save-optimization-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest("[data-optimization-action-review]");
      if (!card) return;
      const field = (name) => card.querySelector(`[data-optimization-action-field="${name}"]`)?.value || "";
      saveOptimizationAction(
        button.dataset.saveActionRunId,
        button.dataset.saveOptimizationAction,
        {
          action: field("action"),
          category: field("category"),
          status: field("status"),
          successMetric: field("successMetric"),
          resultNote: field("resultNote")
        }
      );
    });
  });
  document.querySelectorAll("[data-transfer-optimization-action]").forEach((button) => {
    button.addEventListener("click", () => transferOptimizationAction(
      button.dataset.transferRunId,
      button.dataset.transferOptimizationAction
    ));
  });
  document.querySelector("[data-copy-optimization-feishu]")?.addEventListener("click", copyOptimizationReviewToFeishu);
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
  document.querySelector("[data-copy-preflight]")?.addEventListener("click", copyPreflightStrategyChecklist);
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
    const numericQuality = calculateNumericQuality(importSession.parsed.rows, mapping);
    if (numericQuality.invalidCells > 0) {
      const details = numericQuality.fields
        .filter((field) => field.invalidCells > 0)
        .map((field) => `${FIELD_LABELS[field.field] || field.field} ${field.invalidCells} 个`)
        .join("、");
      showToast(`数值字段含无法解析的内容：${details}。请清理数据或取消对应字段映射。`, "error");
      return;
    }
    const mappedRows = mapRows(importSession.parsed.rows, mapping);
    const availableFields = Object.keys(mapping).filter((field) => mapping[field]);
    const metrics = calculateMetrics(mappedRows, { availableFields });
    const dateQuality = mapping.date ? calculateDateQuality(mappedRows) : null;
    const comparison = mapping.date && importSession.comparisonRanges
      ? calculatePeriodComparison(mappedRows, importSession.comparisonRanges, { availableFields })
      : null;
    const saved = updateProject((project) => {
      project.data = {
        fileName: importSession.name,
        importedAt: new Date().toISOString(),
        metrics,
        dateQuality,
        numericQuality: {
          checkedFields: numericQuality.checkedFields,
          invalidCells: numericQuality.invalidCells,
          blankCells: numericQuality.blankCells
        },
        comparison,
        availableFields,
        isDemo: importSession.isDemo
      };
      if (!importSession.isDemo) project.isDemo = false;
    });
    if (!saved) return;
    importSession = null;
    render();
    const warnings = [];
    if (numericQuality.blankCells > 0) {
      warnings.push(`${numericQuality.blankCells} 个数值单元格为空并按 0 计入`);
    }
    if (dateQuality?.invalidRows) {
      warnings.push(`${dateQuality.invalidRows} 行日期无效，仍计入总计但未计入日期区间与对比`);
    }
    showToast(warnings.length ? `数据已写入；${warnings.join("；")}。` : "数据已计算并写入项目", warnings.length ? "error" : "success");
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
    dateQuality: project.data.dateQuality || null,
    numericQuality: project.data.numericQuality || null,
    sourceFile: project.data.fileName,
    importedAt: project.data.importedAt,
    dataNotice: project.data.isDemo ? "演示数据" : "用户导入聚合数据"
  };
}

function aiRecordMeta(payload) {
  return {
    source: payload.source,
    provider: payload.protocol || payload.provider || "",
    protocol: payload.protocol || payload.provider || "",
    model: payload.model,
    reasoningEffort: payload.reasoningEffort || "",
    durationMs: Number(payload.durationMs || 0),
    fallbackUsed: Boolean(payload.fallbackUsed),
    routeKey: payload.routeKey || ""
  };
}

function completionMessage(label, payload) {
  if (payload.source !== "codex" && payload.source !== "grok" && payload.source !== "api") return label;
  const details = [modelFullName(payload.model)];
  if (payload.reasoningEffort) details.push(`推理：${effortLabel(payload.reasoningEffort)}`);
  if (payload.durationMs) details.push(formatDuration(payload.durationMs));
  if (payload.fallbackUsed) details.push("已自动复核");
  return `${label} · ${details.join(" · ")}`;
}

function selectedApiProtocol() {
  return apiProtocolInputs.find((input) => input.checked)?.value || "openai";
}

function renderApiProtocolFields({ reset = false } = {}) {
  const protocol = selectedApiProtocol();
  const defaults = defaultApiPreferences(protocol);
  if (reset || !String(apiBaseUrlInput.value || "").trim()) {
    apiBaseUrlInput.value = defaults.baseUrl;
  }
  if (reset) apiModelInput.value = defaults.model;
  apiBaseUrlInput.placeholder = defaults.baseUrl;
  if (protocol === "anthropic") {
    apiModelInput.placeholder = "填写 Anthropic 兼容模型 ID";
    apiModelHelp.textContent = "按服务商文档填写模型 ID，例如 Claude 或兼容网关配置的模型名。";
  } else {
    apiModelInput.placeholder = "auto 或服务商提供的模型 ID";
    apiModelHelp.textContent = "OpenAI 官方地址填 auto 时按任务自动选择 Terra / Sol；其他服务请填写模型 ID。";
  }
}

function openApiDialog({ activate = false } = {}) {
  pendingApiActivation = activate;
  const preferences = normalizeApiPreferences(state.apiPreferences || apiSession);
  for (const input of apiProtocolInputs) input.checked = input.value === preferences.protocol;
  apiBaseUrlInput.value = preferences.baseUrl;
  apiModelInput.value = preferences.model;
  apiKeyInput.value = "";
  apiKeyInput.type = "password";
  apiKeyToggle.textContent = "显示";
  apiKeyToggle.setAttribute("aria-label", "显示 API Key");
  apiKeyInput.placeholder = apiSession.connected ? "已在当前会话连接；留空继续使用" : "仅本次会话使用";
  apiConnectionStatus.textContent = apiSession.connected
    ? `${apiProtocolLabel(apiSession.protocol)}已连接，可修改配置后重新测试。`
    : "尚未测试连接。";
  apiConnectionStatus.className = "api-connection-status";
  apiClearButton.hidden = !apiSession.connected;
  renderApiProtocolFields();
  apiDialog.showModal();
  setTimeout(() => apiKeyInput.focus(), 0);
}

function ensureAiModeReady() {
  if (state.aiMode !== "api" || apiSession.connected && apiSession.apiKey) return true;
  openApiDialog({ activate: true });
  showToast("请先连接自己的 API", "error");
  return false;
}

function apiRequestHeaders() {
  return {
    "content-type": "application/json",
    "x-openadops-protocol": apiSession.protocol,
    "x-openadops-base-url": apiSession.baseUrl,
    "x-openadops-model": apiSession.model,
    "x-openadops-api-key": apiSession.apiKey
  };
}

async function requestAi(endpoint, { routeKey, prompt, payload }) {
  if (state.aiMode === "api") {
    return requestJson("./api/provider/generate", {
      method: "POST",
      headers: apiRequestHeaders(),
      body: JSON.stringify({ routeKey, prompt }),
      signal: currentAiJob?.abortController?.signal
    });
  }
  return requestJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function runCreativeRequirements() {
  if (aiBusy) return;
  if (!ensureAiModeReady()) return;
  const project = activeProject();
  const projectId = project.id;
  const production = normalizeCreativeProduction(project, { makeId });
  aiBusy = true;
  if (isLiveAiMode()) beginAiJob("creativeRequirements");
  render();
  try {
    let payload;
    if (state.aiMode === "mock") {
      payload = { ok: true, source: "mock", model: "browser-local-mock", result: buildMockCreativeRequirements(project, production) };
    } else {
      payload = await requestAi("./api/creative-requirements", {
        routeKey: "creativeRequirements",
        prompt: buildApiCreativeRequirementsPrompt({ project, intake: project.intake || createIntake(), workspace: production }),
        payload: { mode: state.aiMode, project, intake: project.intake || createIntake(), workspace: production }
      });
    }
    const saved = updateProjectById(projectId, (target) => {
      const current = syncCreativeProduction(target);
      current.analysis = {
        ...aiRecordMeta(payload),
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
      target.creativeProduction = current;
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage("素材需求建议已生成，请人工采纳", payload));
  } catch (error) {
    handleAiFailure(error);
  } finally {
    finishAiJob();
    aiBusy = false;
    render();
  }
}

function adoptCreativeSuggestions(ids = null) {
  const saved = updateProject((project) => {
    const production = syncCreativeProduction(project);
    const suggestions = production.analysis?.result?.suggestions || [];
    const selected = ids ? suggestions.filter((item) => ids.includes(item.id)) : suggestions;
    const existingKeys = new Set(production.tasks.map((item) => item.sourceKey));
    selected.forEach((suggestion) => {
      const key = `creative_requirement:${suggestion.id}`;
      if (existingKeys.has(key)) return;
      production.tasks.push(creativeRequirementFromSuggestion(suggestion, project, { makeId, now: new Date().toISOString() }));
      existingKeys.add(key);
    });
    syncCreativeProduction(project, production.tasks);
  });
  render();
  if (saved) showToast(ids ? "已采纳 1 条素材需求" : "已采纳全部候选需求");
}

async function runAnalysis(stage) {
  if (aiBusy) return;
  if (!ensureAiModeReady()) return;
  const project = activeProject();
  const projectId = project.id;
  aiBusy = true;
  if (isLiveAiMode()) beginAiJob(stage === "optimize" ? "optimizeAnalysis" : "analysis");
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
      const metrics = metricsForAi(project);
      payload = await requestAi("./api/analyze", {
        routeKey: stage === "optimize" ? "optimizeAnalysis" : "analysis",
        prompt: buildApiAnalysisPrompt({ project, metrics, stage }),
        payload: { mode: state.aiMode, stage, project, metrics }
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
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage(payload.source === "mock" ? "演示结果已生成" : "分析完成", payload));
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

function saveOptimizationAction(runId, actionId, patch) {
  try {
    const saved = updateProject((project) => {
      project.optimizationHistory = updateOptimizationRunAction(
        projectOptimizationHistory(project),
        runId,
        actionId,
        patch
      );
    });
    render();
    if (saved) showToast("优化动作已保存");
  } catch (error) {
    showToast(`更新失败：${error.message}`, "error");
  }
}

function optimizationActionPlatform(project, action) {
  const content = `${action.title || ""} ${action.action || ""} ${action.evidence || ""}`.toLowerCase();
  return project.platforms?.find((platform) => content.includes(platform.toLowerCase())) || project.platforms?.[0] || "Google Ads";
}

function transferOptimizationAction(runId, actionId) {
  const project = activeProject();
  const run = projectOptimizationHistory(project).find((item) => item.id === runId);
  const action = run?.actions?.find((item) => item.id === actionId);
  if (!action) {
    showToast("找不到需要流转的优化动作", "error");
    return;
  }
  const destination = ({ creative: "creative", tracking: "launch" })[action.category];
  if (!destination) {
    showToast("该动作保留在优化清单中，由优化师人工执行和验证。", "error");
    return;
  }
  if (destination === "launch" && !project.launch?.pack?.result) {
    showToast("请先在“上线执行”生成检查清单，再加入归因检查项。", "error");
    return;
  }
  const saved = updateProject((target) => {
    if (destination === "creative") {
      const production = syncCreativeProduction(target);
      const sourceKey = `optimization:${runId}:${actionId}`;
      if (!production.tasks.some((task) => task.sourceKey === sourceKey)) {
        production.tasks.push(normalizeCreativeTask({
          source: "analysis",
          sourceKey,
          platform: optimizationActionPlatform(target, action),
          market: target.markets,
          angle: action.title,
          assetReference: "",
          copy: "",
          modificationNotes: action.action,
          successMetric: action.successMetric,
          aiRationale: action.evidence
        }, {
          makeId,
          now: new Date().toISOString(),
          defaultPlatform: target.platforms?.[0],
          defaultMarket: target.markets
        }));
        syncCreativeProduction(target, production.tasks);
      }
    }
    if (destination === "launch") {
      const pack = target.launch.pack.result;
      const id = `optimization-${actionId}`;
      if (!pack.launch_checklist.some((item) => item.id === id)) {
        pack.launch_checklist.push({
          id,
          category: "tracking",
          item: action.action,
          status: "needs_confirmation",
          owner: action.owner || "优化师",
          evidence: action.evidence
        });
        recalculateLaunchReadiness(pack, true);
      }
    }
    target.optimizationHistory = updateOptimizationRunAction(
      projectOptimizationHistory(target),
      runId,
      actionId,
      {
        status: action.status === "pending" ? "accepted" : action.status,
        transferredTo: destination,
        transferredAt: new Date().toISOString(),
        resultNote: action.resultNote
      }
    );
  });
  if (!saved) return;
  location.hash = destination;
  render();
  showToast(`已流转至${({ creative: "素材需求", launch: "上线执行" })[destination]}`);
}

async function copyOptimizationReviewToFeishu() {
  const run = projectOptimizationHistory(activeProject())[0];
  if (!run?.actions?.length) {
    showToast("当前没有可复制的优化动作", "error");
    return;
  }
  const output = optimizationReviewFeishuTable(run.actions, { statusLabel: optimizationStatusText });
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([output.html], { type: "text/html" }),
        "text/plain": new Blob([output.text], { type: "text/plain" })
      })]);
      showToast("本周期复盘表已复制，可直接粘贴到飞书云文档");
      return;
    }
    await navigator.clipboard.writeText(output.text);
    showToast("本周期复盘表文本已复制");
  } catch (error) {
    showToast(`复制失败：${error?.message || "请检查浏览器剪贴板权限"}`, "error");
  }
}

async function runIntake(action) {
  if (aiBusy) return;
  if (!ensureAiModeReady()) return;
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
  if (isLiveAiMode()) beginAiJob(routeKey);
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
      payload = await requestAi("./api/intake", {
        routeKey,
        prompt: buildApiIntakePrompt({ project, intake, intent }),
        payload: { mode: state.aiMode, intent, profile, project, intake }
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
    const label = intent === "questions" ? "投放前策略清单已生成" : action === "deep" ? "策略初稿深度复核完成" : "策略初稿已生成";
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
    pack.executive_summary = `上线检查项已由优化师更新：${blockers.length ? `存在 ${blockers.length} 个阻塞项，正式花费前必须关闭。` : pack.readiness.status === "conditional" ? "没有硬阻塞项，但仍有待确认事项。" : "所有检查项已标记为可上线，正式花费前仍需项目负责人最终复核。"}`;
  }
}

async function runLaunchPack() {
  if (aiBusy) return;
  if (!ensureAiModeReady()) return;
  const project = activeProject();
  const projectId = project.id;
  if (!project.intake?.analysis?.result && !project.strategy?.objective) {
    showToast("建议先整理客户资料或完善策略初稿，再生成上线执行清单。", "error");
    return;
  }
  aiBusy = true;
  if (isLiveAiMode()) beginAiJob("launchPack");
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
      payload = await requestAi("./api/launch-pack", {
        routeKey: "launchPack",
        prompt: buildApiLaunchPackPrompt({ project, intake: project.intake || createIntake() }),
        payload: { mode: state.aiMode, project, intake: project.intake || createIntake() }
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
    });
    if (!saved) throw new Error("当前项目已变化或本地保存失败，结果未写入");
    showToast(completionMessage("上线执行清单已生成", payload));
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
  if (!launchPack) {
    showToast("请先生成上线执行清单；实验账本会从已确认素材与上线口径建立测试计划。", "error");
    return;
  }
  aiBusy = true;
  if (isLiveAiMode()) beginAiJob("experiments");
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
    "## 投放前策略清单",
    "",
    ...(result.clarification_questions.length ? result.clarification_questions.map((item, index) => `${index + 1}. ${item.question}\n   - 影响：${item.reason}\n   - 处理：${item.priority === "required" ? "上线前完成内部核对" : "可按保守假设推进"}`) : ["投放前关键口径已覆盖。"]),
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

async function copyPreflightStrategyChecklist() {
  const questions = activeProject().intake?.analysis?.result?.clarification_questions || [];
  const content = questions.map((item, index) => `${index + 1}. ${item.question}\n   - ${item.priority === "required" ? "上线阻塞：上线前完成内部核对" : "可带假设：按保守方案推进"}\n   - 影响：${item.reason}`).join("\n");
  try {
    await navigator.clipboard.writeText(content);
    showToast("投放前策略清单已复制");
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
    if (markets) project.markets = markets;
    project.strategy = ensureBuildStrategy(project, { makeId });
    project.strategy.enabled = true;
    project.strategy.objective = draft.positioning;
    project.strategy.audience = briefFieldValue(result, "audience") || draft.working_assumptions.join("\n");
    project.strategy.budgetLogic = draft.platform_plan.map((item) => `${item.platform}：${item.budget_scenario}`).join("\n");
    project.strategy.testLogic = draft.first_week_plan.join("\n");
    project.strategy.campaign.primaryEvent ||= project.goal || "";
    project.strategy.notes ||= draft.working_assumptions.join("\n");
    if (!project.strategy.adGroups.length) {
      project.strategy.adGroups = draft.platform_plan.map((item) => createBuildAdGroup(project, {
        platform: item.platform,
        market: project.markets,
        optimizationEvent: project.goal,
        creativeDirection: draft.creative_plan.join("；")
      }, { makeId }));
    }
  });
  if (!saved) return;
  location.hash = "strategy";
  render();
  showToast("策略初稿已同步到搭建策略，可继续补充搭建参数");
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
    "## 内部待确认",
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

function downloadBinary(bytes, fileName, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBuildStrategyXlsx() {
  const project = activeProject();
  const strategy = normalizeBuildStrategy(project, { makeId });
  if (strategy.enabled !== true) {
    showToast("请先选择“需要搭建策略”", "error");
    return;
  }
  const output = strategyWorkbookDownload(project, strategy, { appVersion: APP_VERSION });
  downloadBinary(output.bytes, output.fileName, output.mime);
  showToast("搭建策略 Excel 已导出");
}

async function copyCreativeRequirementsToFeishu() {
  const project = activeProject();
  const production = normalizeCreativeProduction(project, { makeId });
  if (!production.tasks.length) {
    showToast("没有可复制的素材需求", "error");
    return;
  }
  const output = creativeRequirementsFeishuTable(production);
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([output.html], { type: "text/html" }),
        "text/plain": new Blob([output.text], { type: "text/plain" })
      })]);
      showToast("已复制，直接粘贴到飞书云文档即可");
      return;
    }
    await navigator.clipboard.writeText(output.text);
    showToast("已复制表格文本，可粘贴到飞书云文档");
  } catch (error) {
    showToast(`复制失败：${error?.message || "请检查浏览器剪贴板权限"}`, "error");
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeImportedProject(project) {
  const normalized = {
    ...project,
    stage: normalizeProjectStage(project.stage),
    id: project.id || makeId(),
    name: project.name || "导入项目",
    platforms: Array.isArray(project.platforms) && project.platforms.length ? project.platforms : ["Google Ads"],
    intake: createIntake(project.intake || {}),
    launch: createLaunch(project.launch || {}),
    experiments: createExperiments(project.experiments || {}),
    strategy: normalizeBuildStrategy({
      ...project,
      strategy: isRecord(project.strategy)
        ? project.strategy
        : { objective: "", audience: "", budgetLogic: "", testLogic: "", budgetShares: {} }
    }, { makeId }),
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
        aiMode: normalizeAiMode(isStaticDemo ? "mock" : (parsed.aiMode || state.aiMode), { staticDemo: isStaticDemo }),
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
  </style></head><body><main><p class="eyebrow">OPENADOPS · 投放执行方案 · v${APP_VERSION}</p><h1>${escapeHtml(pack.title)}</h1><p class="lead">${escapeHtml(pack.executive_summary)}</p><div class="meta"><span>${escapeHtml(project.industry)} App</span><span>${escapeHtml(project.markets || "市场待确认")}</span><span>${escapeHtml(project.platforms.join(" / "))}</span><span>${dateText(project.launch.pack.generatedAt)}</span></div><section class="readiness"><div class="score"><strong>${pack.readiness.score}</strong><span>/100</span></div><div><div class="state">${escapeHtml(launchStatusText(pack.readiness.status))}</div><p>${pack.assumptions.map((item) => escapeHtml(item)).join("<br>") || "关键输入已覆盖。"}</p></div><div class="blockers"><span>阻塞项</span><strong>${pack.readiness.blockers.length}</strong><p>${pack.readiness.blockers.map((item) => escapeHtml(item)).join("<br>") || "没有硬阻塞项"}</p></div></section><section class="section"><h2>01 · 媒体分工与预算</h2><table><thead><tr><th>媒体</th><th>角色</th><th>Campaign</th><th>占比</th><th>预算</th></tr></thead><tbody>${pack.media_plan.map((item) => `<tr><td><strong>${escapeHtml(item.platform)}</strong></td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.campaign_type)}</td><td>${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`}</td><td>${escapeHtml(launchBudgetText(item))}</td></tr>`).join("")}</tbody></table></section><section class="section"><h2>02 · Campaign 蓝图</h2><div class="cards">${pack.campaigns.map((item) => `<article class="card"><span>${escapeHtml(item.platform)}</span><h3>${escapeHtml(item.campaign_name)}</h3><p><strong>目标 / 事件：</strong>${escapeHtml(item.objective)} / ${escapeHtml(item.optimization_event)}<br><strong>市场：</strong>${escapeHtml(item.geo)}<br><strong>出价：</strong>${escapeHtml(item.bidding)}<br><strong>预算：</strong>${escapeHtml(item.budget_note)}</p><ul>${item.ad_group_logic.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article>`).join("")}</div></section><section class="section"><h2>03 · 素材生产简报</h2><div class="cards">${pack.creative_briefs.map((item) => `<article class="card"><span>${escapeHtml(item.platform)} · ${item.variants} 个版本</span><h3>${escapeHtml(item.angle)}</h3><blockquote>${escapeHtml(item.hook)}</blockquote><p><strong>假设：</strong>${escapeHtml(item.hypothesis)}</p><p><strong>格式：</strong>${escapeHtml(item.format)}<br><strong>单变量：</strong>${escapeHtml(item.test_variable)}<br><strong>成功指标：</strong>${escapeHtml(item.success_metric)}</p></article>`).join("")}</div></section><section class="section"><h2>04 · 监测与归因</h2><article class="card"><h3>${escapeHtml(pack.measurement.source_of_truth)}</h3><p><strong>主要事件：</strong>${escapeHtml(pack.measurement.primary_event)}</p><ul>${[...pack.measurement.supporting_events,...pack.measurement.attribution_rules,...pack.measurement.tracking_checklist].map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article></section><section class="section"><h2>05 · 上线检查项</h2><table><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${gateRows}</tbody></table></section><section class="section"><h2>06 · 首 7 天行动</h2><div class="week">${pack.first_7_days.map((item) => `<article class="card"><strong>${escapeHtml(item.period)}</strong>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<blockquote>${escapeHtml(item.decision_rule)}</blockquote></article>`).join("")}</div></section><section class="section"><h2>07 · 待确认与风险</h2><div class="cards"><article class="card"><h3>内部待确认</h3><ol>${pack.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>无</li>"}</ol></article><article class="card"><h3>风险说明</h3><ul>${pack.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div></section><p class="foot">OpenAdOps v${APP_VERSION} · 本文件为投前工作草案，不会修改真实广告账户；正式上线前由项目负责人和相关合规人员确认。</p></main></body></html>`;
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
  const optimizationRows = (projectOptimizationHistory(project)[0]?.actions || []).map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.successMetric)}</td><td>${escapeHtml(optimizationStatusText(item.status))}</td><td>${escapeHtml(item.resultNote || "待验证")}</td></tr>`).join("");
  const decisionRows = projectOptimizationHistory(project).slice(0, 5).map((run) => `<tr><td>${escapeHtml(dateTimeText(run.generatedAt))}</td><td>${escapeHtml(run.dataContext?.sourceFile || "未记录")}<br>${escapeHtml(optimizationPeriodText(run))}</td><td>${escapeHtml(optimizationStatusText(run.status))}</td><td>${escapeHtml(run.note || "待补充")}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(project.name)}投放报告</title><style>
  body{margin:0;background:#f3f4f6;color:#1b2430;font-family:Arial,"PingFang SC",sans-serif}main{width:1040px;margin:32px auto;padding:50px;background:#fff;box-sizing:border-box}.eyebrow{color:#e77436;font-size:11px;font-weight:700;letter-spacing:.12em}h1{font-size:34px;margin:8px 0 38px}h2{font-size:18px;margin:34px 0 14px}.meta{color:#77808b;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric,.finding{border:1px solid #e5e8ec;border-radius:10px;padding:16px}.metric span{display:block;color:#77808b;font-size:11px}.metric strong{display:block;margin-top:9px;font-size:21px}.summary{border-left:3px solid #e77436;background:#fff1e8;padding:17px;line-height:1.7}.finding{margin-top:10px}.finding h3{margin:0 0 9px;font-size:15px}.finding p{font-size:12px;line-height:1.7;color:#5f6b79}.actions{width:100%;border-collapse:collapse}.actions th,.actions td{padding:11px;border-bottom:1px solid #e5e8ec;text-align:left;font-size:11px}.notice{margin-top:34px;color:#8c96a3;font-size:10px}@media print{body{background:#fff}main{width:auto;margin:0;padding:24px}}
  </style></head><body><main><p class="eyebrow">OVERSEAS APP UA · PERFORMANCE REVIEW</p><h1>${escapeHtml(project.name)}<br>投放阶段复盘与下一步计划</h1><p class="meta">${escapeHtml(project.industry)} App · ${escapeHtml(project.platforms.join(" / "))} · ${escapeHtml(project.markets)} · ${dateText(new Date().toISOString())}</p><h2>核心指标</h2><div class="metrics">${metricRows.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><h2>管理层摘要</h2><div class="summary">${escapeHtml(result?.executive_summary || "尚未生成结构化分析。")}</div><h2>关键判断</h2>${result?.findings?.map((item) => `<section class="finding"><h3>${escapeHtml(item.title)}</h3><p><strong>证据：</strong>${escapeHtml(item.evidence)}</p><p><strong>判断：</strong>${escapeHtml(item.diagnosis)}</p><p><strong>动作：</strong>${escapeHtml(item.action)}</p><p><strong>验证：</strong>${escapeHtml(item.validation)}</p></section>`).join("") || "<p>暂无。</p>"}<h2>实验与学习</h2><table class="actions"><thead><tr><th>实验</th><th>状态</th><th>可行性</th><th>结果</th><th>学习</th></tr></thead><tbody>${experimentRows}</tbody></table><h2>下一步动作</h2><table class="actions"><thead><tr><th>问题</th><th>动作</th><th>验证口径</th><th>状态</th><th>验证结论</th></tr></thead><tbody>${optimizationRows || "<tr><td colspan=\"5\">暂无动作</td></tr>"}</tbody></table><h2>优化决策记录</h2><table class="actions"><thead><tr><th>诊断时间</th><th>数据与周期</th><th>状态</th><th>人工结论</th></tr></thead><tbody>${decisionRows || "<tr><td colspan=\"4\">暂无记录</td></tr>"}</tbody></table><p class="notice">数据来源：${escapeHtml(project.data?.fileName || "未导入")} · 数据质量：${escapeHtml(dataQualityText(project.data))} · 归因口径：${escapeHtml(project.attribution)} · ${project.isDemo ? "演示数据，不代表任何真实客户表现。" : "由 OpenAdOps 本地工作台生成。"}</p></main></body></html>`;
}

function exportReport() {
  const project = activeProject();
  const report = reportDocument(project).replace(
    /<h2>实验与学习<\/h2><table class="actions">[\s\S]*?<\/table>/,
    ""
  );
  const blob = new Blob([report], { type: "text/html;charset=utf-8" });
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
  if (isStaticDemo && isLiveProviderMode(mode)) {
    showToast("旧版 GitHub Pages 只保留演示，请打开新版网站使用 API，或下载本地版使用 CLI。", "error");
    return;
  }
  if (isCliProviderMode(mode) && !isCliRuntime) {
    showPersistentError("公网版无法直接运行你电脑里的 CLI。请使用 API，或下载本地版后选择 Grok CLI / Codex CLI。");
    return;
  }
  if (mode === "api" && (!apiSession.connected || !apiSession.apiKey)) {
    openApiDialog({ activate: true });
    return;
  }
  if (runtimeProviders[mode]?.available === false) {
    showPersistentError(runtimeProviders[mode].error || "当前模式不可用。");
    return;
  }
  const nextState = {
    ...state,
    aiMode: normalizeAiMode(mode, { staticDemo: isStaticDemo, cliAllowed: isCliRuntime })
  };
  if (!commitState(nextState)) {
    render();
    return;
  }
  applyRoutesForMode(state.aiMode);
  if (aiModeSelect) aiModeSelect.value = state.aiMode;
  render();
}

document.querySelectorAll("[data-ai-mode]").forEach((button) => {
  button.addEventListener("click", () => setAiMode(button.dataset.aiMode));
});
if (aiModeSelect) {
  aiModeSelect.addEventListener("change", () => setAiMode(aiModeSelect.value));
}

apiSettingsButton?.addEventListener("click", () => openApiDialog({ activate: state.aiMode !== "api" }));
for (const input of apiProtocolInputs) {
  input.addEventListener("change", () => renderApiProtocolFields({ reset: true }));
}
apiKeyToggle?.addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  apiKeyToggle.textContent = reveal ? "隐藏" : "显示";
  apiKeyToggle.setAttribute("aria-label", reveal ? "隐藏 API Key" : "显示 API Key");
});
apiClearButton?.addEventListener("click", () => {
  apiSession = { apiKey: "", ...normalizeApiPreferences(state.apiPreferences), connected: false };
  apiKeyInput.value = "";
  apiKeyInput.placeholder = "仅本次会话使用";
  apiClearButton.hidden = true;
  apiConnectionStatus.textContent = "当前页面中的 API Key 已清除。";
  apiConnectionStatus.className = "api-connection-status success";
  render();
  showToast("API Key 已从当前页面清除");
});
document.querySelectorAll("[data-close-api-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    pendingApiActivation = false;
    apiDialog.close();
  });
});
apiForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const preferences = normalizeApiPreferences({
    protocol: selectedApiProtocol(),
    baseUrl: apiBaseUrlInput.value,
    model: apiModelInput.value
  });
  const key = String(apiKeyInput.value || apiSession.apiKey || "").trim();
  const submitButton = apiForm.querySelector('button[type="submit"]');
  if (!key) {
    apiConnectionStatus.textContent = "请填写 API Key。";
    apiConnectionStatus.className = "api-connection-status error";
    return;
  }
  submitButton.disabled = true;
  apiConnectionStatus.textContent = "正在测试连接…";
  apiConnectionStatus.className = "api-connection-status";
  try {
    const payload = await requestJson("./api/provider/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openadops-protocol": preferences.protocol,
        "x-openadops-base-url": preferences.baseUrl,
        "x-openadops-model": preferences.model,
        "x-openadops-api-key": key
      },
      body: "{}"
    });
    const connectedPreferences = normalizeApiPreferences({
      protocol: payload.protocol || preferences.protocol,
      baseUrl: payload.baseUrl || preferences.baseUrl,
      model: payload.model ?? preferences.model
    });
    apiSession = { apiKey: key, ...connectedPreferences, connected: true };
    apiRoutes = payload.routes || publicApiRoutes(connectedPreferences);
    const nextState = {
      ...state,
      aiMode: pendingApiActivation || state.aiMode === "api" ? "api" : state.aiMode,
      apiPreferences: connectedPreferences
    };
    if (!commitState(nextState)) throw new Error("API 偏好未能保存");
    applyRoutesForMode(state.aiMode);
    apiBaseUrlInput.value = connectedPreferences.baseUrl;
    apiModelInput.value = connectedPreferences.model;
    apiConnectionStatus.textContent = `${apiProtocolLabel(connectedPreferences.protocol)}已连接 · ${connectedPreferences.model === "auto" ? "Terra / Sol 自动路由" : connectedPreferences.model}`;
    apiConnectionStatus.className = "api-connection-status success";
    apiClearButton.hidden = false;
    pendingApiActivation = false;
    apiKeyInput.value = "";
    setTimeout(() => {
      apiDialog.close();
      render();
      showToast(`${apiProtocolLabel(connectedPreferences.protocol)}已连接`);
    }, 250);
  } catch (error) {
    apiConnectionStatus.textContent = `连接失败：${error.message}`;
    apiConnectionStatus.className = "api-connection-status error";
  } finally {
    submitButton.disabled = false;
  }
});

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
    stage: "测试期",
    sellingPoints: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      enabled: null,
      objective: "",
      audience: "",
      budgetLogic: "",
      testLogic: "",
      budgetShares: equalBudgetShares(platforms),
      campaign: {},
      adGroups: [],
      ad: {},
      notes: ""
    },
    creativePlan: [],
    creativeProduction: { mode: "undecided", notes: "", commonRequirements: "", analysis: null, tasks: [], updatedAt: new Date().toISOString() },
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

window.addEventListener("hashchange", () => {
  creativeAiPanelOpen = false;
  render();
});
if (!location.hash) location.hash = "overview";
render();
const initialStorageWarning = workspaceLoadWarning(stateLoadResult);
if (initialStorageWarning) showToast(initialStorageWarning, "error");
loadAiRuntime().then(() => {
  if (!aiBusy) render();
});
