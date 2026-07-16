import { FIELD_LABELS, calculateMetrics, detectMapping, formatMetric, mapRows, parseCsv } from "./lib/analytics.js";
import { buildMockAnalysis } from "./lib/mock-analysis.js";
import { buildMockIntake, INTAKE_BRIEF_FIELDS } from "./lib/mock-intake.js";
import { buildMockLaunchPack } from "./lib/mock-launch-pack.js";
import { APP_VERSION } from "./version.js";

const STORAGE_KEY = "openadops:v3";
const PREVIOUS_STORAGE_KEYS = ["openadops:v2", "openadops:v1"];
const LEGACY_STORAGE_KEY = "adpilot:mvp:v1";
const ROUTES = new Set(["overview", "intake", "strategy", "creative", "launch", "optimize", "report"]);
const app = document.querySelector("#app");
const projectSelect = document.querySelector("#projectSelect");
const aiModeSelect = document.querySelector("#aiMode");
const demoBadge = document.querySelector("#demoBadge");
const versionBadge = document.querySelector("#appVersion");
const projectDialog = document.querySelector("#projectDialog");
const projectForm = document.querySelector("#projectForm");
const toast = document.querySelector("#toast");
let importSession = null;
let aiBusy = false;

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
    targetCpi: 2.2,
    targetCpa: 15,
    targetRoas: 1,
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
    data: {
      fileName: "openadops-demo.csv",
      importedAt: new Date().toISOString(),
      metrics: demoMetrics(),
      isDemo: true
    },
    intake: createIntake({
      rawOffer: "产品：Nova Utility 图片处理 App。市场 JP、US、GB；目标 Install；计划投放 Google Ads、Meta Ads、TikTok Ads。客户希望先快速测试，但预算与正式上线时间暂未确认。归因使用 AppsFlyer。",
      clientStrategy: "先以 Google 建立稳定安装基线；Meta 和 TikTok 用短视频素材探索增量。该策略仅供代理商参考，可根据预算和素材情况调整。",
      operatorNotes: "目标 CPI 2.2 USD。客户当前每周可提供 3 条录屏素材，需要确认 D1/D7 留存目标和各市场优先级。",
      strategyAuthority: "reference"
    }),
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
  return project;
}

function initialState() {
  const demo = createDemoProject();
  return { activeProjectId: demo.id, aiMode: "mock", projects: [demo] };
}

function loadState() {
  for (const key of [STORAGE_KEY, ...PREVIOUS_STORAGE_KEYS, LEGACY_STORAGE_KEY]) {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      if (stored?.projects?.length) {
        const normalized = {
          ...stored,
          aiMode: stored.aiMode || "mock",
          projects: stored.projects.map((project) => ({ ...project, intake: createIntake(project.intake || {}), launch: createLaunch(project.launch || {}) }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch {
      // Try the next storage generation.
    }
  }
  return initialState();
}

let state = loadState();
const isStaticDemo = location.hostname.endsWith("github.io") || location.protocol === "file:";
if (isStaticDemo) {
  state.aiMode = "mock";
  const codexOption = aiModeSelect.querySelector('option[value="codex"]');
  if (codexOption) {
    codexOption.disabled = true;
    codexOption.textContent = "Codex CLI · run locally";
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast visible${type === "error" ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = "toast";
  }, 3600);
}

function updateProject(mutator) {
  const project = activeProject();
  mutator(project);
  project.updatedAt = new Date().toISOString();
  saveState();
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
    <div>
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </div>
    ${actions ? `<div class="inline-actions">${actions}</div>` : ""}
  </header>`;
}

function metricCards(project) {
  const summary = project.data?.metrics?.summary || {};
  const currency = project.currency || "USD";
  const cards = [
    ["Spend", formatMetric(summary.spend, "currency", currency), project.data ? `${project.data.metrics.rowCount} rows` : "待导入"],
    ["AF Installs", formatMetric(summary.af_installs || summary.installs), "归因安装"],
    ["AF-CPI", formatMetric(summary.afCpi, "currency", currency), `目标 ${formatMetric(project.targetCpi, "currency", currency)}`],
    ["CTR", formatMetric(summary.ctr, "percent"), "点击 / 展示"],
    ["D1 Retention", formatMetric(summary.d1Retention, "percent"), "留存质量"],
    ["ROAS", formatMetric(summary.roas, "ratio"), `目标 ${Number(project.targetRoas || 0).toFixed(2)}x`]
  ];
  return `<div class="metric-grid">${cards
    .map(([label, value, hint]) => `<div class="metric-card"><span>${label}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`)
    .join("")}</div>`;
}

function platformTable(project) {
  const rows = project.data?.metrics?.byPlatform || [];
  if (!rows.length) return emptyState("还没有媒体数据", "前往投放优化页导入 CSV，工作台会自动生成媒体与国家表现。", "optimize", "导入数据");
  return `<div class="table-wrap"><table>
    <thead><tr><th>媒体</th><th>Spend</th><th>AF Installs</th><th>CTR</th><th>CVR</th><th>AF-CPI</th><th>D1 Ret.</th><th>ROAS</th></tr></thead>
    <tbody>${rows.map((item) => `<tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${formatMetric(item.spend, "currency", project.currency)}</td>
      <td>${formatMetric(item.af_installs || item.installs)}</td>
      <td>${formatMetric(item.ctr, "percent")}</td>
      <td>${formatMetric(item.cvr, "percent")}</td>
      <td>${formatMetric(item.afCpi, "currency", project.currency)}</td>
      <td>${formatMetric(item.d1Retention, "percent")}</td>
      <td>${formatMetric(item.roas, "ratio")}</td>
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
    <div class="bar-value">${formatMetric(row.afCpi, "currency", project.currency)}</div>
  </div>`).join("")}</div>`;
}

function emptyState(title, description, targetRoute, buttonLabel) {
  return `<div class="empty-state"><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>${targetRoute ? `<button class="button button-secondary button-small" data-go-route="${attr(targetRoute)}">${escapeHtml(buttonLabel)}</button>` : ""}</div></div>`;
}

function analysisToolbar(stage) {
  const mode = state.aiMode === "codex" ? "Codex CLI · configured model" : "Browser-local Mock（无需账号）";
  return `<div class="analysis-toolbar">
    <div><strong>结构化 AI 判断</strong><span>${escapeHtml(mode)} · 结果需通过 JSON Schema</span></div>
    <button class="button button-primary" data-run-ai="${attr(stage)}" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在分析…" : state.aiMode === "codex" ? "调用 Codex Ads" : "运行 Mock 演示"}</button>
  </div>`;
}

function aiResult(project, stage) {
  const record = project.ai?.[stage];
  if (!record?.result) return emptyState("还没有分析结果", "先完善项目信息或导入数据，再运行结构化分析。Mock 模式用于演示界面，不会占用模型额度。", "", "");
  const result = record.result;
  const sourceText = record.source === "codex" ? `Codex · ${record.model}` : "Mock 演示结果";
  return `<div class="ai-result">
    <div class="summary-callout"><strong>${escapeHtml(sourceText)}</strong><br />${escapeHtml(result.executive_summary)}</div>
    ${result.findings.map((item) => `<article class="finding-card">
      <div class="finding-top"><h3>${escapeHtml(item.title)}</h3><div class="badge-row"><span class="priority-badge ${attr(item.priority)}">${escapeHtml(priorityText(item.priority))}</span><span class="confidence-badge">置信度 ${escapeHtml(confidenceText(item.confidence))}</span></div></div>
      <p class="finding-diagnosis">${escapeHtml(item.diagnosis)}</p>
      <div class="finding-body"><div class="evidence-box"><span>Evidence</span><p>${escapeHtml(item.evidence)}</p></div><div class="action-box"><span>Action</span><p>${escapeHtml(item.action)}</p></div></div>
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
  return ({ offer: "客户 Offer", client_strategy: "客户策略", operator_notes: "优化师补充", ai_inference: "AI 推断", unknown: "待补充" })[value] || "待补充";
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
    return `<section class="card">${emptyState("等待第一份客户资料", "把 Offer、客户已有策略和自己的会议记录粘贴到上方。OpenAdOps 会整理 Brief、标记缺失项，并生成 Strategy v0。", "", "")}</section>`;
  }
  const counts = { confirmed: 0, inferred: 0, missing: 0 };
  result.brief_fields.forEach((field) => { counts[field.status] = (counts[field.status] || 0) + 1; });
  const draft = result.strategy_draft;
  const questions = result.clarification_questions || [];
  const versions = project.intake?.versions || [];
  const sourceLabel = record.source === "codex" ? `Codex · ${record.model}` : "Browser-local Mock";

  return `<div class="intake-result-stack">
    <section class="intake-summary">
      <div><span class="card-label">${escapeHtml(sourceLabel)} · ${dateText(record.generatedAt)}</span><p>${escapeHtml(result.executive_summary)}</p></div>
      <div class="intake-counts" aria-label="Brief 完整度">
        <div class="intake-count confirmed"><strong>${counts.confirmed}</strong><span>已确认</span></div>
        <div class="intake-count inferred"><strong>${counts.inferred}</strong><span>待确认</span></div>
        <div class="intake-count missing"><strong>${counts.missing}</strong><span>缺失</span></div>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>结构化 Brief</h2><p>编辑任意字段后会自动标记为“优化师已确认”</p></div><span class="card-label">${counts.confirmed}/${result.brief_fields.length} CONFIRMED</span></div>
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
        <div class="card-header"><div><h2>客户追问清单</h2><p>按对策略影响排序，可直接复制给客户</p></div><div class="inline-actions"><span class="badge question-badge">${questions.length} QUESTIONS</span>${questions.length ? `<button class="button button-ghost button-small" data-copy-questions>复制追问</button>` : ""}</div></div>
        ${questions.length ? `<div class="question-list">${questions.map((item, index) => `<article class="question-item"><span>${String(index + 1).padStart(2, "0")}</span><div><div class="question-top"><strong>${escapeHtml(item.question)}</strong><em class="${attr(item.priority)}">${item.priority === "required" ? "必须确认" : "建议确认"}</em></div><p>${escapeHtml(item.reason)}</p></div></article>`).join("")}</div>` : `<div class="success-note">关键资料已覆盖，建议由项目负责人做最后口径确认。</div>`}
      </section>
      <section class="card strategy-v0-hero">
        <div class="card-header"><div><h2>Strategy v0</h2><p>带假设的前期策略草案，不等同于最终执行方案</p></div><span class="card-label">WORKING DRAFT</span></div>
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
      <div class="card-header"><div><h2>策略版本</h2><p>保存客户资料和 Strategy v0 的当前快照</p></div><button class="button button-secondary button-small" data-save-intake-version>保存当前版本</button></div>
      ${versions.length ? `<div class="version-list">${versions.map((version) => `<div class="version-row"><div><strong>${escapeHtml(version.name)}</strong><span>${dateText(version.savedAt)}</span></div><button class="button button-ghost button-small" data-restore-intake-version="${attr(version.id)}">恢复</button></div>`).join("")}</div>` : `<p class="muted">还没有保存版本。正式发送或采用策略前，建议先保存一份快照。</p>`}
    </section>
  </div>`;
}

function renderIntake(project) {
  const intake = project.intake || createIntake();
  const result = intakeRecord(project)?.result;
  const actions = result ? `<button class="button button-secondary" data-export-intake>导出 Markdown</button><button class="button button-primary" data-save-intake-version>保存版本</button>` : "";
  const mode = state.aiMode === "codex" ? "本地 Codex CLI · 使用当前配置模型" : "Browser-local Mock · 不消耗模型额度";
  return `${pageHeader("STAGE 00 · OFFER INTAKE", "需求接收台", "把客户 Offer、零散策略和会议记录整理成可追溯 Brief，再生成带假设的 Strategy v0。", actions)}
    <section class="card intake-source-card mb-16">
      <div class="card-header"><div><h2>原始资料</h2><p>资料不完整也可以开始；未知信息会被显式标记，不会由 AI 偷偷补齐</p></div><span class="card-label">LOCAL PROJECT DATA</span></div>
      <div class="intake-source-grid">
        <label class="source-panel offer"><span><strong>客户 Offer</strong><em>${textLength(intake.rawOffer)} 字</em></span><textarea data-intake-field="rawOffer" placeholder="粘贴客户发来的产品、市场、目标、预算、KPI、素材、时间等信息……">${escapeHtml(intake.rawOffer)}</textarea></label>
        <label class="source-panel strategy"><span><strong>客户已有策略</strong><em>${textLength(intake.clientStrategy)} 字</em></span><select data-intake-field="strategyAuthority"><option value="reference" ${intake.strategyAuthority !== "mandatory" ? "selected" : ""}>仅供参考，可调整</option><option value="mandatory" ${intake.strategyAuthority === "mandatory" ? "selected" : ""}>必须执行的约束</option></select><textarea data-intake-field="clientStrategy" placeholder="粘贴客户给出的媒体、预算或素材建议；没有可以留空。">${escapeHtml(intake.clientStrategy)}</textarea></label>
        <label class="source-panel notes"><span><strong>我的补充</strong><em>${textLength(intake.operatorNotes)} 字</em></span><textarea data-intake-field="operatorNotes" placeholder="补充会议记录、自己的判断、待确认问题与不能忽略的限制……">${escapeHtml(intake.operatorNotes)}</textarea></label>
      </div>
      <div class="intake-runbar"><div><strong>AI 处理方式</strong><span>${escapeHtml(mode)} · 原始资料只在你主动运行时提交给本地 Bridge</span></div><div class="inline-actions"><button class="button button-secondary" data-run-intake="questions" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在整理…" : "生成客户追问"}</button><button class="button button-primary" data-run-intake="strategy" ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : state.aiMode === "codex" ? "调用 Codex 生成 Strategy v0" : "生成 Mock Strategy v0"}</button></div></div>
    </section>
    ${renderIntakeResult(project)}`;
}

function textLength(value) {
  return String(value || "").trim().length;
}

function renderOverview(project) {
  const hasIntake = Boolean(project.intake?.analysis?.result);
  const hasStrategy = Boolean(project.strategy?.objective && project.strategy?.testLogic);
  const hasCreative = Boolean(project.creativePlan?.length);
  const launchPack = project.launch?.pack?.result;
  const launchReady = Boolean(launchPack);
  const hasOptimize = Boolean(project.data?.metrics && (project.ai?.optimize || project.ai?.strategy));
  return `${pageHeader("PROJECT COMMAND CENTER", project.name, "把策略、素材、广告搭建和优化证据沉淀在同一个项目里。")}
    ${metricCards(project)}
    <div class="grid overview-grid mb-16">
      <section class="card">
        <div class="card-header"><div><h2>全链路进度</h2><p>五个核心阶段完成后，自动汇总为老板可读报告</p></div><button class="button button-secondary button-small" data-go-route="report">查看报告</button></div>
        <div class="stage-flow">
          <article class="stage-step ${hasIntake ? "complete" : ""}" data-step="00"><h3>需求接收</h3><p>碎片资料、缺失项、客户追问与 Strategy v0</p></article>
          <article class="stage-step ${hasStrategy ? "complete" : ""}" data-step="01"><h3>投放策略</h3><p>目标、市场、媒体、预算与测试逻辑</p></article>
          <article class="stage-step ${hasCreative ? "complete" : ""}" data-step="02"><h3>素材计划</h3><p>角度、Hook、单变量与成功指标</p></article>
          <article class="stage-step ${launchReady ? "complete" : ""}" data-step="03"><h3>投前作战包</h3><p>Campaign、素材、监测、阻塞项与首周计划</p></article>
          <article class="stage-step ${hasOptimize ? "complete" : ""}" data-step="04"><h3>投放优化</h3><p>数据证据、诊断、动作和验证</p></article>
        </div>
      </section>
      <aside class="card">
        <div class="card-header"><div><h2>项目档案</h2><p>${project.isDemo ? "演示项目，可直接体验完整链路" : "项目设定自动保存"}</p></div></div>
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
    <div class="grid grid-2">
      <section class="card"><div class="card-header"><div><h2>国家效率</h2><p>横条为花费占比，右侧显示 AF-CPI</p></div></div>${spendBars(project)}</section>
      <section class="card"><div class="card-header"><div><h2>述职产出就绪度</h2><p>不是单次结果，而是可复用方法与案例证据</p></div><span class="badge" style="color:var(--success);background:var(--success-soft)">${[hasIntake, hasStrategy, hasCreative, launchReady, hasOptimize].filter(Boolean).length}/5</span></div>
        <div class="timeline">
          <div class="timeline-item"><strong>方法层</strong><p>多行业 × 多媒体的统一项目结构与指标口径</p></div>
          <div class="timeline-item"><strong>执行层</strong><p>从策略到优化动作，全程留下负责人和验证标准</p></div>
          <div class="timeline-item"><strong>证据层</strong><p>CSV 数据、AI 结构化判断和报告预览可追溯</p></div>
        </div>
      </section>
    </div>`;
}

function renderStrategy(project) {
  return `${pageHeader("STAGE 01 · STRATEGY", "投放策略", "建立可复用的业务输入、媒体分工、预算逻辑和测试假设。")}
    <div class="grid grid-2 mb-16">
      <section class="card">
        <div class="card-header"><div><h2>项目输入</h2><p>这些信息会随聚合指标一起发送给 Codex</p></div></div>
        <div class="form-grid two-columns">
          <label class="field"><span>目标市场</span><input data-project-field="markets" value="${attr(project.markets)}" /></label>
          <label class="field"><span>项目阶段</span><select data-project-field="stage">${["准备期", "测试期", "放量期", "稳定期"].map((value) => `<option ${project.stage === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="field"><span>主要目标</span><select data-project-field="goal">${["Install", "Registration", "Purchase", "ROAS"].map((value) => `<option ${project.goal === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="field"><span>归因来源</span><select data-project-field="attribution">${["AppsFlyer", "Adjust", "媒体后台", "GA4"].map((value) => `<option ${project.attribution === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
          <label class="field"><span>目标 CPI</span><input type="number" step="0.01" data-project-field="targetCpi" value="${attr(project.targetCpi)}" /></label>
          <label class="field"><span>目标 CPA</span><input type="number" step="0.01" data-project-field="targetCpa" value="${attr(project.targetCpa)}" /></label>
          <label class="field"><span>目标 ROAS</span><input type="number" step="0.01" data-project-field="targetRoas" value="${attr(project.targetRoas)}" /></label>
          <label class="field"><span>月预算</span><input type="number" step="1" data-project-field="budget" value="${attr(project.budget)}" /></label>
          <label class="field field-wide"><span>产品卖点</span><textarea data-project-field="sellingPoints">${escapeHtml(project.sellingPoints)}</textarea></label>
          <label class="field field-wide"><span>补充说明</span><textarea data-project-field="notes">${escapeHtml(project.notes)}</textarea></label>
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h2>策略假设</h2><p>先写判断，再用数据验证，避免事后解释</p></div></div>
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

function getCreativeTests(project) {
  const aiTests = project.ai?.creative?.result?.creative_tests || project.ai?.strategy?.result?.creative_tests;
  if (aiTests?.length) return aiTests.map((item) => ({ angle: item.angle, hook: item.hook, platform: item.platform, variable: item.variable, metric: item.success_metric }));
  return project.creativePlan || [];
}

function creativeTable(project) {
  const tests = getCreativeTests(project);
  if (!tests.length) return emptyState("还没有素材测试计划", "运行 AI 分析生成跨媒体素材方向，或先在策略页完善产品卖点。", "strategy", "完善策略");
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>媒体</th><th>素材角度</th><th>Hook</th><th>单变量</th><th>成功指标</th></tr></thead><tbody>${tests.map((item, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><strong>${escapeHtml(item.platform)}</strong></td><td>${escapeHtml(item.angle)}</td><td class="cell-wrap">${escapeHtml(item.hook)}</td><td class="cell-wrap">${escapeHtml(item.variable)}</td><td class="cell-wrap">${escapeHtml(item.metric)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderCreative(project) {
  return `${pageHeader("STAGE 02 · CREATIVE", "素材计划", "把素材从“多做几条”变成可验证的角度、Hook 和单变量测试矩阵。")}
    <div class="grid grid-3 mb-16">
      <article class="card"><span class="card-label">GOOGLE ADS</span><h3>信息覆盖</h3><p class="muted">功能证明、不同长度资产、国家语言匹配与商店页一致性。</p></article>
      <article class="card"><span class="card-label">META ADS</span><h3>概念多样性</h3><p class="muted">差异化角度、首帧可读性、UGC 与结果展示，减少素材聚类。</p></article>
      <article class="card"><span class="card-label">TIKTOK ADS</span><h3>原生注意力</h3><p class="muted">前 3 秒 Hook、人物/录屏节奏、平台语境与安全区。</p></article>
    </div>
    <section class="card mb-16"><div class="card-header"><div><h2>跨媒体素材测试矩阵</h2><p>每行只改变一个变量，成功指标写在上线前</p></div><span class="badge" style="color:var(--accent-deep);background:var(--accent-soft)">${getCreativeTests(project).length} TESTS</span></div>${creativeTable(project)}</section>
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
      <div class="launch-empty-copy"><span class="card-label">OFFER → EXECUTION</span><h2>生成第一份投前作战包</h2><p>OpenAdOps 会把 Brief、Strategy v0 和项目设置组合成 Campaign 蓝图、素材生产 Brief、监测方案、上线阻塞项和首 7 天计划。</p></div>
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
  const sourceLabel = record.source === "codex" ? `Codex · ${record.model}` : "Browser-local Mock";
  const statusOptions = (current) => ["ready", "needs_confirmation", "blocker"].map((status) => `<option value="${status}" ${status === current ? "selected" : ""}>${launchStatusText(status)}</option>`).join("");
  return `<div class="launch-pack-stack">
    <section class="launch-readiness ${attr(readiness.status)}">
      <div class="readiness-score"><strong>${readiness.score}</strong><span>/ 100</span></div>
      <div class="readiness-copy"><span class="card-label">${escapeHtml(sourceLabel)} · ${dateText(record.generatedAt)}</span><h2>${escapeHtml(launchStatusText(readiness.status))}</h2><p>${escapeHtml(pack.executive_summary)}</p></div>
      <div class="readiness-blockers"><span>BLOCKERS</span><strong>${readiness.blockers.length}</strong><small>${readiness.blockers.length ? escapeHtml(readiness.blockers[0]) : "没有硬阻塞项"}</small></div>
    </section>

    ${pack.assumptions.length ? `<section class="assumption-banner"><strong>当前假设</strong><div>${pack.assumptions.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : ""}

    <section class="card">
      <div class="card-header"><div><h2>媒体分工与预算</h2><p>预算缺失时保持为空；预算不足时主动收敛媒体</p></div><span class="card-label">MEDIA PLAN</span></div>
      <div class="table-wrap"><table class="launch-media-table"><thead><tr><th>媒体</th><th>角色</th><th>Campaign 类型</th><th>占比</th><th>月预算</th><th>前置条件</th></tr></thead><tbody>${pack.media_plan.map((item) => `<tr class="${Number(item.allocation_percent) === 0 ? "muted-row" : ""}"><td><strong>${escapeHtml(item.platform)}</strong><small>${escapeHtml(item.objective)}</small></td><td>${escapeHtml(item.role)}<small>${escapeHtml(item.rationale)}</small></td><td>${escapeHtml(item.campaign_type)}</td><td>${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`}</td><td>${escapeHtml(launchBudgetText(item))}</td><td>${item.prerequisites.map((value) => `<span class="mini-tag">${escapeHtml(value)}</span>`).join("")}</td></tr>`).join("")}</tbody></table></div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Campaign Blueprint</h2><p>命名、目标、事件、出价和拆分逻辑可直接交给投手</p></div><span class="badge launch-count">${pack.campaigns.length} CAMPAIGNS</span></div>
      <div class="campaign-blueprint-grid">${pack.campaigns.map((item) => `<article class="campaign-blueprint"><div class="campaign-code"><span>${escapeHtml(item.platform)}</span><strong>${escapeHtml(item.campaign_name)}</strong></div><div class="campaign-facts"><div><span>优化事件</span><strong>${escapeHtml(item.optimization_event)}</strong></div><div><span>市场</span><strong>${escapeHtml(item.geo)}</strong></div><div><span>出价</span><strong>${escapeHtml(item.bidding)}</strong></div><div><span>预算</span><strong>${escapeHtml(item.budget_note)}</strong></div></div><div class="campaign-lists"><div><span>结构逻辑</span>${item.ad_group_logic.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div><div><span>受众与排除</span>${item.audience_notes.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div></div></article>`).join("")}</div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>素材生产 Brief</h2><p>每张卡片只有一个主要测试变量，并预先写明成功指标</p></div><span class="badge launch-count">${pack.creative_briefs.length} BRIEFS</span></div>
      <div class="launch-creative-grid">${pack.creative_briefs.map((item) => `<article class="launch-creative-card"><div class="creative-card-top"><span>${escapeHtml(item.platform)}</span><em>${item.variants} VARIANTS</em></div><h3>${escapeHtml(item.angle)}</h3><blockquote>${escapeHtml(item.hook)}</blockquote><p><strong>假设：</strong>${escapeHtml(item.hypothesis)}</p><dl><div><dt>格式</dt><dd>${escapeHtml(item.format)}</dd></div><div><dt>单变量</dt><dd>${escapeHtml(item.test_variable)}</dd></div><div><dt>成功指标</dt><dd>${escapeHtml(item.success_metric)}</dd></div></dl><div class="production-notes">${item.production_notes.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div><div class="compliance-note">${item.compliance_notes.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}</div></article>`).join("")}</div>
    </section>

    <div class="grid launch-measurement-grid">
      <section class="card"><div class="card-header"><div><h2>监测与归因</h2><p>媒体反馈、MMP 和业务真相分层使用</p></div><span class="card-label">MEASUREMENT</span></div><div class="measurement-hero"><span>最终口径</span><strong>${escapeHtml(pack.measurement.source_of_truth)}</strong></div>${renderStrategyList("主要与辅助事件", [pack.measurement.primary_event, ...pack.measurement.supporting_events])}${renderStrategyList("归因规则", pack.measurement.attribution_rules)}${renderStrategyList("追踪检查", pack.measurement.tracking_checklist)}</section>
      <section class="card"><div class="card-header"><div><h2>首 7 天行动</h2><p>先定义观察和动作边界，避免上线后临时解释</p></div><span class="card-label">DAY 0–7</span></div><div class="launch-week">${pack.first_7_days.map((item) => `<article><span>${escapeHtml(item.period)}</span><div>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<strong>${escapeHtml(item.decision_rule)}</strong></div></article>`).join("")}</div></section>
    </div>

    <section class="card">
      <div class="card-header"><div><h2>上线 Gate</h2><p>你可以人工更新状态；Blocker 会自动反映到顶部就绪度</p></div><span class="card-label">OWNER × EVIDENCE</span></div>
      <div class="table-wrap"><table class="launch-gate-table"><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${pack.launch_checklist.map((item) => `<tr><td><span class="gate-category">${escapeHtml(item.category)}</span></td><td><strong>${escapeHtml(item.item)}</strong></td><td><select class="gate-status ${attr(item.status)}" data-launch-status="${attr(item.id)}">${statusOptions(item.status)}</select></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.evidence)}</td></tr>`).join("")}</tbody></table></div>
    </section>

    <div class="grid grid-2">
      <section class="card"><div class="card-header"><div><h2>待确认问题</h2><p>在正式上线前关闭高影响缺口</p></div><span class="badge question-badge">${pack.open_questions.length}</span></div>${pack.open_questions.length ? `<ol class="launch-question-list">${pack.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : `<div class="success-note">当前没有未记录的问题。</div>`}</section>
      <section class="card"><div class="card-header"><div><h2>风险说明</h2><p>不把 AI 草案伪装成正式客户结论</p></div><span class="card-label">RISK REGISTER</span></div><div class="launch-risk-list">${pack.risks.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}</div></section>
    </div>

    <section class="card version-card">
      <div class="card-header"><div><h2>Launch Pack 版本</h2><p>在发送客户或开始搭建前保存快照</p></div><button class="button button-secondary button-small" data-save-launch-version>保存当前版本</button></div>
      ${versions.length ? `<div class="version-list">${versions.map((version) => `<div class="version-row"><div><strong>${escapeHtml(version.name)}</strong><span>${dateText(version.savedAt)}</span></div><button class="button button-ghost button-small" data-restore-launch-version="${attr(version.id)}">恢复</button></div>`).join("")}</div>` : `<p class="muted">还没有保存 Launch Pack 快照。</p>`}
    </section>
  </div>`;
}

function renderLaunch(project) {
  const record = launchPackRecord(project);
  const actions = record?.result ? `<button class="button button-ghost" data-export-launch-pack>导出 Markdown</button><button class="button button-secondary" data-export-launch-html>导出 HTML</button><button class="button button-primary" data-save-launch-version>保存版本</button>` : "";
  const mode = state.aiMode === "codex" ? "本地 Codex CLI · 使用当前配置模型" : "Browser-local Mock · 不消耗模型额度";
  return `${pageHeader("STAGE 03 · LAUNCH PACK", "投前作战包", "把 Strategy v0 变成可交给投放、素材、数据和客户负责人的执行文件。", actions)}
    <section class="card launch-runbar mb-16"><div><strong>生成方式</strong><span>${escapeHtml(mode)} · 只生成计划，不会连接或修改真实广告账户</span></div><button class="button button-primary" data-run-launch-pack ${aiBusy ? "disabled" : ""}>${aiBusy ? "正在生成…" : state.aiMode === "codex" ? "调用 Codex 生成 Launch Pack" : "生成 Mock Launch Pack"}</button></section>
    ${renderLaunchPackResult(project)}`;
}

function mappingPanel() {
  if (!importSession) return "";
  return `<div class="mt-16"><div class="card-header"><div><h3>字段映射 · ${escapeHtml(importSession.name)}</h3><p>已识别 ${importSession.parsed.rows.length} 行；请确认关键字段后计算</p></div><button class="button button-primary button-small" data-apply-import>计算并写入项目</button></div>
    <div class="mapping-grid">${Object.entries(FIELD_LABELS).map(([field, label]) => `<div class="mapping-item"><label>${escapeHtml(label)}</label><select class="mapping-select" data-map-field="${field}"><option value="">不映射</option>${importSession.parsed.headers.map((header) => `<option value="${attr(header)}" ${importSession.mapping[field] === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></div>`).join("")}</div></div>`;
}

function renderOptimize(project) {
  return `${pageHeader("STAGE 04 · OPTIMIZATION", "投放优化", "上传媒体或 AppsFlyer CSV，先由代码计算，再让 AI 基于证据做判断。")}
    <section class="card mb-16">
      <div class="card-header"><div><h2>数据导入</h2><p>V1 支持 CSV；原始明细仅在当前页面解析，项目只保存聚合指标</p></div>${project.data ? `<span class="badge" style="color:var(--success);background:var(--success-soft)">${escapeHtml(project.data.fileName)}</span>` : ""}</div>
      <div class="drop-zone"><strong>导入媒体 / AppsFlyer 报表</strong><span>支持带引号的 CSV；可手动调整字段映射</span><div class="upload-actions" style="justify-content:center"><label class="button button-secondary">选择 CSV<input id="csvInput" type="file" accept=".csv,text/csv" /></label><button class="button button-ghost" data-load-demo>载入演示 CSV</button></div></div>
      ${mappingPanel()}
    </section>
    ${metricCards(project)}
    <div class="grid grid-2 mb-16"><section class="card"><div class="card-header"><div><h2>媒体对比</h2><p>重点看 AF-CPI、CVR 与留存是否同步</p></div></div>${platformTable(project)}</section><section class="card"><div class="card-header"><div><h2>国家效率</h2><p>右侧为 AF-CPI</p></div></div>${spendBars(project)}</section></div>
    <section class="card">${analysisToolbar("optimize")}${aiResult(project, "optimize")}</section>`;
}

function latestAnalysis(project) {
  return project.ai?.optimize || project.ai?.strategy || project.ai?.creative || null;
}

function actionTable(result) {
  if (!result?.next_actions?.length) return `<p class="muted">运行分析后生成下一步动作。</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>动作</th><th>负责人</th><th>时间</th><th>成功指标</th></tr></thead><tbody>${result.next_actions.map((item) => `<tr><td class="cell-wrap"><strong>${escapeHtml(item.action)}</strong></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.timing)}</td><td class="cell-wrap">${escapeHtml(item.success_metric)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderReport(project) {
  const record = latestAnalysis(project);
  const result = record?.result;
  const summary = project.data?.metrics?.summary || {};
  const actions = `<button class="button button-secondary" data-export-report>导出 HTML</button><button class="button button-primary" data-print-report>打印 / PDF</button>`;
  return `${pageHeader("REPORT CENTER", "报告输出", "把项目输入、数据证据、诊断和下一步动作压缩为管理层可读的一页报告。", actions)}
    <article class="report-preview">
      <div class="report-cover"><div><p class="eyebrow">OVERSEAS APP UA · PERFORMANCE REVIEW</p><h2>${escapeHtml(project.name)}<br />投放阶段复盘与下一步计划</h2></div><div class="report-meta">${escapeHtml(project.industry)} App · ${escapeHtml(project.platforms.join(" / "))}<br />${escapeHtml(project.markets || "市场待设置")} · ${dateText(new Date().toISOString())}<br />${project.isDemo ? "演示数据，不代表真实客户表现" : "OpenAdOps 本地工作台生成"}</div></div>
      <section class="report-section"><h3>01 · 核心指标</h3>${metricCards(project)}</section>
      <section class="report-section"><h3>02 · 管理层摘要</h3><div class="summary-callout">${escapeHtml(result?.executive_summary || "尚未生成结构化分析。建议先在“投放优化”导入数据并运行分析。")}</div></section>
      <section class="report-section"><h3>03 · 关键判断</h3>${result ? result.findings.map((item) => `<article class="finding-card"><div class="finding-top"><h3>${escapeHtml(item.title)}</h3><span class="priority-badge ${attr(item.priority)}">${priorityText(item.priority)}</span></div><div class="finding-body"><div class="evidence-box"><span>Evidence</span><p>${escapeHtml(item.evidence)}</p></div><div class="action-box"><span>Action</span><p>${escapeHtml(item.action)}</p></div></div><p class="finding-diagnosis">${escapeHtml(item.diagnosis)} · 验证：${escapeHtml(item.validation)}</p></article>`).join("") : emptyState("还没有关键判断", "AI 失败时不会生成假结果；请在其他阶段重新运行。", "optimize", "去优化页")}</section>
      <section class="report-section"><h3>04 · 下一步动作</h3>${actionTable(result)}</section>
      <section class="report-section"><h3>05 · 口径说明</h3><div class="project-facts"><div class="fact-row"><span>数据来源</span><strong>${escapeHtml(project.data?.fileName || "未导入")}</strong></div><div class="fact-row"><span>归因口径</span><strong>${escapeHtml(project.attribution)}</strong></div><div class="fact-row"><span>分析来源</span><strong>${record ? escapeHtml(record.source === "codex" ? `${record.model} + Codex Ads` : "Mock 演示") : "未运行"}</strong></div><div class="fact-row"><span>项目备注</span><strong>${escapeHtml(project.notes || "无")}</strong></div></div></section>
    </article>`;
}

const renderers = { overview: renderOverview, intake: renderIntake, strategy: renderStrategy, creative: renderCreative, launch: renderLaunch, optimize: renderOptimize, report: renderReport };

function refreshShell(project) {
  projectSelect.innerHTML = state.projects.map((item) => `<option value="${attr(item.id)}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  aiModeSelect.value = state.aiMode;
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
      updateProject((project) => {
        if (!project.intake) project.intake = createIntake();
        project.intake[input.dataset.intakeField] = input.value;
      });
      showToast("原始资料已保存");
    });
  });
  document.querySelectorAll("[data-brief-key]").forEach((input) => {
    input.addEventListener("change", () => {
      updateProject((project) => {
        const field = project.intake?.analysis?.result?.brief_fields?.find((item) => item.key === input.dataset.briefKey);
        if (!field) return;
        field.value = input.value.trim();
        field.status = field.value ? "confirmed" : "missing";
        field.source = field.value ? "operator_notes" : "unknown";
        field.evidence = field.value ? "优化师在结构化 Brief 中手动确认" : "优化师清空该字段，需要重新补充";
        if (field.value) {
          project.intake.analysis.result.clarification_questions = project.intake.analysis.result.clarification_questions.filter((item) => item.field_key !== field.key);
        }
      });
      render();
      showToast("Brief 字段已确认");
    });
  });
  document.querySelectorAll("[data-project-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.type === "number" ? Number(input.value) : input.value;
      updateProject((project) => setNested(project, input.dataset.projectField, value));
      showToast("项目已保存");
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
  document.querySelectorAll("[data-launch-status]").forEach((select) => {
    select.addEventListener("change", () => {
      updateProject((project) => {
        const pack = project.launch?.pack?.result;
        const item = pack?.launch_checklist?.find((entry) => entry.id === select.dataset.launchStatus);
        if (!item) return;
        item.status = select.value;
        item.evidence = select.value === "ready" ? `${item.evidence}；优化师已人工确认` : item.evidence;
        recalculateLaunchReadiness(pack, true);
      });
      render();
      showToast("上线 Gate 状态已更新");
    });
  });
  document.querySelectorAll("[data-go-route]").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.goRoute; }));
  document.querySelectorAll("[data-run-ai]").forEach((button) => button.addEventListener("click", () => runAnalysis(button.dataset.runAi)));
  document.querySelectorAll("[data-run-intake]").forEach((button) => button.addEventListener("click", () => runIntake(button.dataset.runIntake)));
  document.querySelector("[data-run-launch-pack]")?.addEventListener("click", runLaunchPack);
  document.querySelectorAll("[data-save-intake-version]").forEach((button) => button.addEventListener("click", saveIntakeVersion));
  document.querySelectorAll("[data-restore-intake-version]").forEach((button) => button.addEventListener("click", () => restoreIntakeVersion(button.dataset.restoreIntakeVersion)));
  document.querySelector("[data-export-intake]")?.addEventListener("click", exportIntakeMarkdown);
  document.querySelector("[data-adopt-intake]")?.addEventListener("click", adoptIntakeStrategy);
  document.querySelector("[data-copy-questions]")?.addEventListener("click", copyClarificationQuestions);
  document.querySelectorAll("[data-save-launch-version]").forEach((button) => button.addEventListener("click", saveLaunchVersion));
  document.querySelectorAll("[data-restore-launch-version]").forEach((button) => button.addEventListener("click", () => restoreLaunchVersion(button.dataset.restoreLaunchVersion)));
  document.querySelector("[data-export-launch-pack]")?.addEventListener("click", exportLaunchPackMarkdown);
  document.querySelector("[data-export-launch-html]")?.addEventListener("click", exportLaunchPackHtml);
  document.querySelectorAll("[data-map-field]").forEach((select) => select.addEventListener("change", () => { importSession.mapping[select.dataset.mapField] = select.value; }));
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
    importSession = { name, parsed, mapping: detectMapping(parsed.headers), isDemo };
    render();
    showToast(`已读取 ${parsed.rows.length} 行，请确认字段映射`);
  } catch (error) {
    showToast(`CSV 读取失败：${error.message}`, "error");
  }
}

function applyImport() {
  if (!importSession) return;
  const mapping = importSession.mapping;
  if (!mapping.spend || (!mapping.installs && !mapping.af_installs)) {
    showToast("至少需要映射花费，以及媒体安装或 AF 安装。", "error");
    return;
  }
  try {
    const metrics = calculateMetrics(mapRows(importSession.parsed.rows, mapping));
    updateProject((project) => {
      project.data = {
        fileName: importSession.name,
        importedAt: new Date().toISOString(),
        metrics,
        isDemo: importSession.isDemo
      };
      if (!importSession.isDemo) project.isDemo = false;
    });
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
    byPlatform: metrics.byPlatform.slice(0, 10),
    byCountry: metrics.byCountry.slice(0, 12),
    byCampaign: metrics.byCampaign.slice(0, 12),
    sourceFile: project.data.fileName,
    importedAt: project.data.importedAt,
    dataNotice: project.data.isDemo ? "演示数据" : "用户导入聚合数据"
  };
}

async function runAnalysis(stage) {
  if (aiBusy) return;
  aiBusy = true;
  render();
  try {
    const project = activeProject();
    let payload;
    if (state.aiMode === "mock") {
      payload = {
        ok: true,
        source: "mock",
        model: "browser-local-mock",
        result: buildMockAnalysis(project, metricsForAi(project))
      };
    } else {
      const response = await fetch("./api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, stage, project, metrics: metricsForAi(project) })
      });
      payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "分析失败");
    }
    updateProject((target) => {
      if (!target.ai) target.ai = {};
      target.ai[stage] = {
        source: payload.source,
        model: payload.model,
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
      if (stage === "creative" && payload.result.creative_tests?.length) {
        target.creativePlan = payload.result.creative_tests.map((item) => ({
          angle: item.angle,
          hook: item.hook,
          platform: item.platform,
          variable: item.variable,
          metric: item.success_metric
        }));
      }
    });
    showToast(payload.source === "codex" ? `Codex 分析完成 · ${payload.model}` : "Mock 演示结果已生成");
  } catch (error) {
    showToast(`没有写入结果：${error.message}`, "error");
  } finally {
    aiBusy = false;
    render();
  }
}

async function runIntake(intent) {
  if (aiBusy) return;
  const project = activeProject();
  const intake = project.intake || createIntake();
  if (![intake.rawOffer, intake.clientStrategy, intake.operatorNotes].some((value) => String(value || "").trim())) {
    showToast("请至少粘贴一段客户资料或自己的补充说明。", "error");
    return;
  }
  aiBusy = true;
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
      const response = await fetch("./api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, intent, project, intake })
      });
      payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "需求整理失败");
    }
    updateProject((target) => {
      if (!target.intake) target.intake = createIntake();
      target.intake.analysis = {
        source: payload.source,
        model: payload.model,
        intent,
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
    });
    showToast(intent === "questions" ? "客户追问清单已生成" : payload.source === "codex" ? `Strategy v0 已生成 · ${payload.model}` : "Mock Strategy v0 已生成");
  } catch (error) {
    showToast(`没有写入结果：${error.message}`, "error");
  } finally {
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
    pack.executive_summary = `上线 Gate 已由优化师更新：当前就绪度 ${pack.readiness.score}%，${blockers.length ? `存在 ${blockers.length} 个阻塞项，正式花费前必须关闭。` : pack.readiness.status === "conditional" ? "没有硬阻塞项，但仍有待确认事项。" : "所有 Gate 已标记为可上线，仍建议由项目负责人做最终复核。"}`;
  }
}

async function runLaunchPack() {
  if (aiBusy) return;
  const project = activeProject();
  if (!project.intake?.analysis?.result && !project.strategy?.objective) {
    showToast("建议先整理 Offer 或完善 Strategy v0，再生成投前作战包。", "error");
    return;
  }
  aiBusy = true;
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
      const response = await fetch("./api/launch-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: state.aiMode, project, intake: project.intake || createIntake() })
      });
      payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Launch Pack 生成失败");
    }
    updateProject((target) => {
      if (!target.launch) target.launch = createLaunch();
      target.launch.pack = {
        source: payload.source,
        model: payload.model,
        generatedAt: new Date().toISOString(),
        result: payload.result
      };
      target.launch.checklist = Object.fromEntries(payload.result.launch_checklist.map((item) => [item.id, item.status === "ready"]));
      target.creativePlan = payload.result.creative_briefs.map((item) => ({
        angle: item.angle,
        hook: item.hook,
        platform: item.platform,
        variable: item.test_variable,
        metric: item.success_metric
      }));
    });
    showToast(payload.source === "codex" ? `Launch Pack 已生成 · ${payload.model}` : "Mock Launch Pack 已生成");
  } catch (error) {
    showToast(`没有写入结果：${error.message}`, "error");
  } finally {
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
    showToast("先生成或整理一版 Strategy v0。", "error");
    return;
  }
  updateProject((target) => {
    if (!target.intake.versions) target.intake.versions = [];
    const number = target.intake.versions.length + 1;
    target.intake.versions.unshift({
      id: makeId(),
      name: `Strategy v0.${number}`,
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
  showToast("当前策略版本已保存");
}

function restoreIntakeVersion(versionId) {
  const version = activeProject().intake?.versions?.find((item) => item.id === versionId);
  if (!version?.snapshot) return;
  updateProject((project) => {
    const versions = project.intake.versions || [];
    project.intake = { ...createIntake(), ...cloneJson(version.snapshot), versions };
  });
  render();
  showToast(`已恢复 ${version.name}`);
}

function intakeMarkdown(project) {
  const intake = project.intake || createIntake();
  const result = intake.analysis?.result;
  if (!result) return "";
  const draft = result.strategy_draft;
  const lines = [
    `# ${project.name} · Strategy v0`,
    "",
    `> ${result.executive_summary}`,
    "",
    "## 原始资料",
    "",
    "### 客户 Offer",
    intake.rawOffer || "未提供",
    "",
    "### 客户已有策略",
    intake.clientStrategy || "未提供",
    "",
    "### 优化师补充",
    intake.operatorNotes || "未提供",
    "",
    "## 结构化 Brief",
    "",
    "| 字段 | 内容 | 状态 | 来源 |",
    "| --- | --- | --- | --- |",
    ...result.brief_fields.map((field) => `| ${BRIEF_FIELD_META[field.key]?.label || field.key} | ${markdownCell(field.value || "—")} | ${intakeStatusText(field.status)} | ${intakeSourceText(field.source)} |`),
    "",
    "## 客户追问",
    "",
    ...(result.clarification_questions.length ? result.clarification_questions.map((item, index) => `${index + 1}. ${item.question}\n   - 原因：${item.reason}`) : ["关键资料已覆盖，无必须追问项。"]),
    "",
    "## Strategy v0",
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
    showToast("还没有可导出的 Strategy v0。", "error");
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-Strategy-v0.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Strategy v0 Markdown 已导出");
}

async function copyClarificationQuestions() {
  const questions = activeProject().intake?.analysis?.result?.clarification_questions || [];
  const content = questions.map((item, index) => `${index + 1}. ${item.question}`).join("\n");
  try {
    await navigator.clipboard.writeText(content);
    showToast("客户追问已复制");
  } catch {
    showToast("浏览器不允许复制，请使用导出 Markdown。", "error");
  }
}

function adoptIntakeStrategy() {
  const result = activeProject().intake?.analysis?.result;
  if (!result) return;
  const draft = result.strategy_draft;
  updateProject((project) => {
    const markets = briefFieldValue(result, "markets");
    const audience = briefFieldValue(result, "audience");
    if (markets) project.markets = markets;
    if (!project.strategy) project.strategy = {};
    project.strategy.objective = draft.positioning;
    project.strategy.audience = audience || draft.working_assumptions.join("\n");
    project.strategy.budgetLogic = draft.platform_plan.map((item) => `${item.platform}：${item.budget_scenario}`).join("\n");
    project.strategy.testLogic = draft.first_week_plan.join("\n");
  });
  location.hash = "strategy";
  render();
  showToast("Strategy v0 已同步到投放策略，可继续人工修改");
}

function saveLaunchVersion() {
  const packRecord = activeProject().launch?.pack;
  if (!packRecord?.result) {
    showToast("先生成一份 Launch Pack。", "error");
    return;
  }
  updateProject((project) => {
    if (!project.launch) project.launch = createLaunch();
    if (!project.launch.versions) project.launch.versions = [];
    const number = project.launch.versions.length + 1;
    project.launch.versions.unshift({
      id: makeId(),
      name: `Launch Pack v0.${number}`,
      savedAt: new Date().toISOString(),
      snapshot: cloneJson(project.launch.pack)
    });
    project.launch.versions = project.launch.versions.slice(0, 10);
  });
  render();
  showToast("Launch Pack 版本已保存");
}

function restoreLaunchVersion(versionId) {
  const version = activeProject().launch?.versions?.find((item) => item.id === versionId);
  if (!version?.snapshot) return;
  updateProject((project) => {
    if (!project.launch) project.launch = createLaunch();
    project.launch.pack = cloneJson(version.snapshot);
    project.launch.checklist = Object.fromEntries(project.launch.pack.result.launch_checklist.map((item) => [item.id, item.status === "ready"]));
  });
  render();
  showToast(`已恢复 ${version.name}`);
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
    `- 生成来源：${project.launch.pack.source === "codex" ? `Codex · ${project.launch.pack.model}` : "Browser-local Mock"}`,
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
    "## Campaign Blueprint",
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
    "## 素材生产 Brief",
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
    "## 上线 Gate",
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

function safeProjectFileName(project, suffix) {
  return `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-${suffix}`;
}

function exportLaunchPackMarkdown() {
  const project = activeProject();
  const content = launchPackMarkdown(project);
  if (!content) {
    showToast("还没有可导出的 Launch Pack。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Launch-Pack.md"), "text/markdown;charset=utf-8");
  showToast("Launch Pack Markdown 已导出");
}

function launchPackDocument(project) {
  const pack = project.launch?.pack?.result;
  if (!pack) return "";
  const gateRows = pack.launch_checklist.map((item) => `<tr><td>${escapeHtml(item.category)}</td><td><strong>${escapeHtml(item.item)}</strong></td><td><span class="status ${attr(item.status)}">${escapeHtml(launchStatusText(item.status))}</span></td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.evidence)}</td></tr>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pack.title)}</title><style>
  :root{--ink:#17212b;--muted:#687382;--line:#dfe4e8;--paper:#fff;--bg:#edf0f2;--accent:#e86f34;--accent-soft:#fff0e8;--success:#247a55;--risk:#b8443e}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,Arial,"PingFang SC",sans-serif}main{width:min(1120px,calc(100% - 32px));margin:32px auto;background:var(--paper);padding:56px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--accent)}h1{font-size:42px;line-height:1.12;margin:10px 0 20px}.lead{font-size:16px;line-height:1.8;color:var(--muted);max-width:860px}.readiness{margin:34px 0;display:grid;grid-template-columns:150px 1fr 220px;gap:28px;padding:26px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(135deg,#fff,var(--accent-soft))}.score strong{font-size:58px}.score span{color:var(--muted)}.state{font-size:24px;font-weight:800}.blockers{border-left:1px solid var(--line);padding-left:22px}.blockers strong{display:block;font-size:32px}.meta{display:flex;gap:18px;color:var(--muted);font-size:12px}.section{margin-top:42px}.section h2{font-size:22px;margin:0 0 16px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{border:1px solid var(--line);border-radius:12px;padding:18px;break-inside:avoid}.card span{font-size:10px;font-weight:800;color:var(--accent);letter-spacing:.08em}.card h3{font-size:16px;margin:8px 0}.card p,.card li{font-size:12px;line-height:1.7;color:var(--muted)}blockquote{margin:12px 0;padding:12px 14px;border-left:3px solid var(--accent);background:var(--accent-soft);font-weight:700}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:9px;letter-spacing:.08em;text-transform:uppercase}.status{display:inline-block;padding:4px 8px;border-radius:99px;background:#eef1f3}.status.ready{color:var(--success);background:#e7f5ee}.status.blocker{color:var(--risk);background:#fdebea}.week{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.week strong{display:block;margin-bottom:8px}.foot{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}@media(max-width:760px){main{width:100%;margin:0;padding:24px}.readiness,.cards,.week{grid-template-columns:1fr}.blockers{border-left:0;border-top:1px solid var(--line);padding:14px 0 0}h1{font-size:30px}}@media print{body{background:#fff}main{width:auto;margin:0;padding:28px}.section{break-inside:auto}.card{break-inside:avoid}}
  </style></head><body><main><p class="eyebrow">OPENADOPS · LAUNCH PACK · v${APP_VERSION}</p><h1>${escapeHtml(pack.title)}</h1><p class="lead">${escapeHtml(pack.executive_summary)}</p><div class="meta"><span>${escapeHtml(project.industry)} App</span><span>${escapeHtml(project.markets || "市场待确认")}</span><span>${escapeHtml(project.platforms.join(" / "))}</span><span>${dateText(project.launch.pack.generatedAt)}</span></div><section class="readiness"><div class="score"><strong>${pack.readiness.score}</strong><span>/100</span></div><div><div class="state">${escapeHtml(launchStatusText(pack.readiness.status))}</div><p>${pack.assumptions.map((item) => escapeHtml(item)).join("<br>") || "关键输入已覆盖。"}</p></div><div class="blockers"><span>BLOCKERS</span><strong>${pack.readiness.blockers.length}</strong><p>${pack.readiness.blockers.map((item) => escapeHtml(item)).join("<br>") || "没有硬阻塞项"}</p></div></section><section class="section"><h2>01 · 媒体分工与预算</h2><table><thead><tr><th>媒体</th><th>角色</th><th>Campaign</th><th>占比</th><th>预算</th></tr></thead><tbody>${pack.media_plan.map((item) => `<tr><td><strong>${escapeHtml(item.platform)}</strong></td><td>${escapeHtml(item.role)}</td><td>${escapeHtml(item.campaign_type)}</td><td>${item.allocation_percent === null ? "—" : `${item.allocation_percent}%`}</td><td>${escapeHtml(launchBudgetText(item))}</td></tr>`).join("")}</tbody></table></section><section class="section"><h2>02 · Campaign Blueprint</h2><div class="cards">${pack.campaigns.map((item) => `<article class="card"><span>${escapeHtml(item.platform)}</span><h3>${escapeHtml(item.campaign_name)}</h3><p><strong>目标 / 事件：</strong>${escapeHtml(item.objective)} / ${escapeHtml(item.optimization_event)}<br><strong>市场：</strong>${escapeHtml(item.geo)}<br><strong>出价：</strong>${escapeHtml(item.bidding)}<br><strong>预算：</strong>${escapeHtml(item.budget_note)}</p><ul>${item.ad_group_logic.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article>`).join("")}</div></section><section class="section"><h2>03 · 素材生产 Brief</h2><div class="cards">${pack.creative_briefs.map((item) => `<article class="card"><span>${escapeHtml(item.platform)} · ${item.variants} VARIANTS</span><h3>${escapeHtml(item.angle)}</h3><blockquote>${escapeHtml(item.hook)}</blockquote><p><strong>假设：</strong>${escapeHtml(item.hypothesis)}</p><p><strong>格式：</strong>${escapeHtml(item.format)}<br><strong>单变量：</strong>${escapeHtml(item.test_variable)}<br><strong>成功指标：</strong>${escapeHtml(item.success_metric)}</p></article>`).join("")}</div></section><section class="section"><h2>04 · 监测与归因</h2><article class="card"><h3>${escapeHtml(pack.measurement.source_of_truth)}</h3><p><strong>主要事件：</strong>${escapeHtml(pack.measurement.primary_event)}</p><ul>${[...pack.measurement.supporting_events,...pack.measurement.attribution_rules,...pack.measurement.tracking_checklist].map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></article></section><section class="section"><h2>05 · 上线 Gate</h2><table><thead><tr><th>类别</th><th>检查项</th><th>状态</th><th>负责人</th><th>证据 / 缺口</th></tr></thead><tbody>${gateRows}</tbody></table></section><section class="section"><h2>06 · 首 7 天行动</h2><div class="week">${pack.first_7_days.map((item) => `<article class="card"><strong>${escapeHtml(item.period)}</strong>${item.actions.map((value) => `<p>${escapeHtml(value)}</p>`).join("")}<blockquote>${escapeHtml(item.decision_rule)}</blockquote></article>`).join("")}</div></section><section class="section"><h2>07 · 待确认与风险</h2><div class="cards"><article class="card"><h3>待确认问题</h3><ol>${pack.open_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>无</li>"}</ol></article><article class="card"><h3>风险说明</h3><ul>${pack.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article></div></section><p class="foot">OpenAdOps v${APP_VERSION} · 本文件为投前工作草案，不会修改真实广告账户；正式上线前由项目负责人和相关合规人员确认。</p></main></body></html>`;
}

function exportLaunchPackHtml() {
  const project = activeProject();
  const content = launchPackDocument(project);
  if (!content) {
    showToast("还没有可导出的 Launch Pack。", "error");
    return;
  }
  downloadText(content, safeProjectFileName(project, "Launch-Pack.html"), "text/html;charset=utf-8");
  showToast("Launch Pack HTML 已导出");
}

function reportDocument(project) {
  const record = latestAnalysis(project);
  const result = record?.result;
  const summary = project.data?.metrics?.summary || {};
  const metricRows = [
    ["Spend", formatMetric(summary.spend, "currency", project.currency)],
    ["AF Installs", formatMetric(summary.af_installs || summary.installs)],
    ["AF-CPI", formatMetric(summary.afCpi, "currency", project.currency)],
    ["CTR", formatMetric(summary.ctr, "percent")],
    ["D1 Retention", formatMetric(summary.d1Retention, "percent")],
    ["ROAS", formatMetric(summary.roas, "ratio")]
  ];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(project.name)}投放报告</title><style>
  body{margin:0;background:#f3f4f6;color:#1b2430;font-family:Arial,"PingFang SC",sans-serif}main{width:1040px;margin:32px auto;padding:50px;background:#fff;box-sizing:border-box}.eyebrow{color:#e77436;font-size:11px;font-weight:700;letter-spacing:.12em}h1{font-size:34px;margin:8px 0 38px}h2{font-size:18px;margin:34px 0 14px}.meta{color:#77808b;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric,.finding{border:1px solid #e5e8ec;border-radius:10px;padding:16px}.metric span{display:block;color:#77808b;font-size:11px}.metric strong{display:block;margin-top:9px;font-size:21px}.summary{border-left:3px solid #e77436;background:#fff1e8;padding:17px;line-height:1.7}.finding{margin-top:10px}.finding h3{margin:0 0 9px;font-size:15px}.finding p{font-size:12px;line-height:1.7;color:#5f6b79}.actions{width:100%;border-collapse:collapse}.actions th,.actions td{padding:11px;border-bottom:1px solid #e5e8ec;text-align:left;font-size:11px}.notice{margin-top:34px;color:#8c96a3;font-size:10px}@media print{body{background:#fff}main{width:auto;margin:0;padding:24px}}
  </style></head><body><main><p class="eyebrow">OVERSEAS APP UA · PERFORMANCE REVIEW</p><h1>${escapeHtml(project.name)}<br>投放阶段复盘与下一步计划</h1><p class="meta">${escapeHtml(project.industry)} App · ${escapeHtml(project.platforms.join(" / "))} · ${escapeHtml(project.markets)} · ${dateText(new Date().toISOString())}</p><h2>核心指标</h2><div class="metrics">${metricRows.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><h2>管理层摘要</h2><div class="summary">${escapeHtml(result?.executive_summary || "尚未生成结构化分析。")}</div><h2>关键判断</h2>${result?.findings?.map((item) => `<section class="finding"><h3>${escapeHtml(item.title)}</h3><p><strong>证据：</strong>${escapeHtml(item.evidence)}</p><p><strong>判断：</strong>${escapeHtml(item.diagnosis)}</p><p><strong>动作：</strong>${escapeHtml(item.action)}</p><p><strong>验证：</strong>${escapeHtml(item.validation)}</p></section>`).join("") || "<p>暂无。</p>"}<h2>下一步动作</h2><table class="actions"><thead><tr><th>动作</th><th>负责人</th><th>时间</th><th>成功指标</th></tr></thead><tbody>${result?.next_actions?.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml(item.timing)}</td><td>${escapeHtml(item.success_metric)}</td></tr>`).join("") || ""}</tbody></table><p class="notice">数据来源：${escapeHtml(project.data?.fileName || "未导入")} · 归因口径：${escapeHtml(project.attribution)} · ${project.isDemo ? "演示数据，不代表任何真实客户表现。" : "由 OpenAdOps 本地工作台生成。"}</p></main></body></html>`;
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
  showToast("报告 HTML 已导出");
}

projectSelect.addEventListener("change", () => {
  state.activeProjectId = projectSelect.value;
  importSession = null;
  saveState();
  render();
});

aiModeSelect.addEventListener("change", () => {
  state.aiMode = aiModeSelect.value;
  saveState();
  render();
});

document.querySelector("#newProjectButton").addEventListener("click", () => projectDialog.showModal());
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
    targetCpi: 0,
    targetCpa: 0,
    targetRoas: 0,
    attribution: "AppsFlyer",
    stage: "准备期",
    sellingPoints: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: { objective: "", audience: "", budgetLogic: "", testLogic: "", budgetShares: Object.fromEntries(platforms.map((platform) => [platform, Math.round(100 / platforms.length)])) },
    creativePlan: [],
    launch: createLaunch(),
    intake: createIntake(),
    ai: {}
  };
  state.projects.push(project);
  state.activeProjectId = project.id;
  saveState();
  projectForm.reset();
  projectDialog.close();
  location.hash = "intake";
  render();
  showToast("项目已创建");
});

window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "overview";
render();
