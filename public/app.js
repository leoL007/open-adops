import { FIELD_LABELS, calculateMetrics, detectMapping, formatMetric, mapRows, parseCsv } from "./lib/analytics.js";
import { buildMockAnalysis } from "./lib/mock-analysis.js";

const STORAGE_KEY = "openadops:v1";
const LEGACY_STORAGE_KEY = "adpilot:mvp:v1";
const ROUTES = new Set(["overview", "strategy", "creative", "launch", "optimize", "report"]);
const app = document.querySelector("#app");
const projectSelect = document.querySelector("#projectSelect");
const aiModeSelect = document.querySelector("#aiMode");
const demoBadge = document.querySelector("#demoBadge");
const projectDialog = document.querySelector("#projectDialog");
const projectForm = document.querySelector("#projectForm");
const toast = document.querySelector("#toast");
let importSession = null;
let aiBusy = false;

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

function createDemoProject() {
  return {
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
    launch: {
      checklist: {
        naming: true,
        attribution: true,
        deepLink: false,
        budget: true,
        creative: true,
        exclusions: false
      }
    },
    data: {
      fileName: "openadops-demo.csv",
      importedAt: new Date().toISOString(),
      metrics: demoMetrics(),
      isDemo: true
    },
    ai: {}
  };
}

function initialState() {
  const demo = createDemoProject();
  return { activeProjectId: demo.id, aiMode: "mock", projects: [demo] };
}

function loadState() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (current?.projects?.length) return current;
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.projects?.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
      return legacy;
    }
  } catch {
    // Fall through to a fresh local demo state.
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

function renderOverview(project) {
  const hasStrategy = Boolean(project.strategy?.objective && project.strategy?.testLogic);
  const hasCreative = Boolean(project.creativePlan?.length);
  const checks = Object.values(project.launch?.checklist || {}).filter(Boolean).length;
  const hasOptimize = Boolean(project.data?.metrics && (project.ai?.optimize || project.ai?.strategy));
  return `${pageHeader("PROJECT COMMAND CENTER", project.name, "把策略、素材、广告搭建和优化证据沉淀在同一个项目里。")}
    ${metricCards(project)}
    <div class="grid overview-grid mb-16">
      <section class="card">
        <div class="card-header"><div><h2>全链路进度</h2><p>四个核心阶段完成后，自动汇总为老板可读报告</p></div><button class="button button-secondary button-small" data-go-route="report">查看报告</button></div>
        <div class="stage-flow">
          <article class="stage-step ${hasStrategy ? "complete" : ""}" data-step="01"><h3>投放策略</h3><p>目标、市场、媒体、预算与测试逻辑</p></article>
          <article class="stage-step ${hasCreative ? "complete" : ""}" data-step="02"><h3>素材计划</h3><p>角度、Hook、单变量与成功指标</p></article>
          <article class="stage-step ${checks >= 4 ? "complete" : ""}" data-step="03"><h3>广告搭建</h3><p>Campaign 结构、命名和上线检查</p></article>
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
      <section class="card"><div class="card-header"><div><h2>述职产出就绪度</h2><p>不是单次结果，而是可复用方法与案例证据</p></div><span class="badge" style="color:var(--success);background:var(--success-soft)">${[hasStrategy, hasCreative, checks >= 4, hasOptimize].filter(Boolean).length}/4</span></div>
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

function renderLaunch(project) {
  const checklist = project.launch?.checklist || {};
  const checklistItems = [
    ["naming", "命名规则包含市场、目标、受众和测试变量"],
    ["attribution", "媒体 SDK / MMP 事件与归因窗口已确认"],
    ["deepLink", "落地页、商店页或 Deep Link 已验证"],
    ["budget", "预算与出价不会让 Campaign 互相抢量"],
    ["creative", "素材尺寸、文案和平台安全区已检查"],
    ["exclusions", "排除项、品牌词和再营销重叠已检查"]
  ];
  const monthly = Number(project.budget) || 0;
  return `${pageHeader("STAGE 03 · LAUNCH", "广告搭建", "把策略翻译为可执行的 Campaign / Ad set 结构，并保留上线检查记录。")}
    <section class="card mb-16"><div class="card-header"><div><h2>媒体搭建清单</h2><p>建议结构，不会连接或修改真实广告账户</p></div><span class="card-label">READ-ONLY PLAN</span></div>
      <div class="table-wrap"><table><thead><tr><th>媒体</th><th>建议目标</th><th>Campaign 结构</th><th>月预算</th><th>日预算参考</th><th>命名示例</th></tr></thead><tbody>${project.platforms.map((platform) => {
        const share = Number(project.strategy?.budgetShares?.[platform] ?? 100 / project.platforms.length) / 100;
        const amount = monthly * share;
        const architecture = platform === "Google Ads" ? "市场 × 优化目标" : platform === "Meta Ads" ? "市场 × 概念组" : "市场 × 素材角度";
        return `<tr><td><strong>${escapeHtml(platform)}</strong></td><td>${escapeHtml(project.goal)}</td><td>${architecture}</td><td>${formatMetric(amount, "currency", project.currency)}</td><td>${formatMetric(amount / 30, "currency", project.currency)}</td><td>${escapeHtml(`${platform.split(" ")[0]}_${project.markets.split(",")[0]?.trim() || "GEO"}_${project.goal}_T01`)}</td></tr>`;
      }).join("")}</tbody></table></div>
    </section>
    <div class="grid grid-2">
      <section class="card"><div class="card-header"><div><h2>上线前检查</h2><p>勾选状态会保存在项目中</p></div><span class="badge" style="color:var(--success);background:var(--success-soft)">${Object.values(checklist).filter(Boolean).length}/${checklistItems.length}</span></div><div class="checklist">${checklistItems.map(([key, text]) => `<label class="check-item"><input type="checkbox" data-launch-check="${key}" ${checklist[key] ? "checked" : ""} /><span>${escapeHtml(text)}</span></label>`).join("")}</div></section>
      <section class="card"><div class="card-header"><div><h2>搭建原则</h2><p>统一逻辑，媒体差异化落地</p></div></div><div class="timeline">
        <div class="timeline-item"><strong>先保证可判断</strong><p>Campaign 数量服从预算和转化量，不为结构完整而拆散学习。</p></div>
        <div class="timeline-item"><strong>再保证可复用</strong><p>命名、市场、目标与测试变量统一，后续 CSV 可自动识别。</p></div>
        <div class="timeline-item"><strong>最后保证可追溯</strong><p>每次上线记录假设、版本、负责人和成功标准。</p></div>
      </div></section>
    </div>`;
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

const renderers = { overview: renderOverview, strategy: renderStrategy, creative: renderCreative, launch: renderLaunch, optimize: renderOptimize, report: renderReport };

function refreshShell(project) {
  projectSelect.innerHTML = state.projects.map((item) => `<option value="${attr(item.id)}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  aiModeSelect.value = state.aiMode;
  demoBadge.hidden = !project.isDemo;
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
  document.querySelectorAll("[data-launch-check]").forEach((input) => {
    input.addEventListener("change", () => {
      updateProject((project) => {
        if (!project.launch) project.launch = { checklist: {} };
        if (!project.launch.checklist) project.launch.checklist = {};
        project.launch.checklist[input.dataset.launchCheck] = input.checked;
      });
      render();
    });
  });
  document.querySelectorAll("[data-go-route]").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.goRoute; }));
  document.querySelectorAll("[data-run-ai]").forEach((button) => button.addEventListener("click", () => runAnalysis(button.dataset.runAi)));
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
    launch: { checklist: {} },
    ai: {}
  };
  state.projects.push(project);
  state.activeProjectId = project.id;
  saveState();
  projectForm.reset();
  projectDialog.close();
  location.hash = "strategy";
  render();
  showToast("项目已创建");
});

window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "overview";
render();
