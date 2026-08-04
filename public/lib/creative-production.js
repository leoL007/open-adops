export const CREATIVE_TASK_STATUSES = [
  { value: "backlog", label: "待排期" },
  { value: "in_progress", label: "制作中" },
  { value: "review", label: "待审核" },
  { value: "delivered", label: "已交付" },
  { value: "live", label: "已上线" }
];

export const CREATIVE_REQUIREMENT_MODES = [
  { value: "existing", label: "整理已有素材" },
  { value: "new", label: "生成新需求" },
  { value: "skip", label: "本轮跳过" }
];

const STATUS_VALUES = new Set(CREATIVE_TASK_STATUSES.map((item) => item.value));
const MODE_VALUES = new Set(CREATIVE_REQUIREMENT_MODES.map((item) => item.value));
const GENERATED_SOURCES = new Set(["legacy", "analysis", "launch_pack"]);

function text(value) {
  return String(value ?? "").trim();
}

function own(task, key, fallback) {
  return Object.prototype.hasOwnProperty.call(task, key) ? task[key] : fallback;
}

function optionalPositiveInteger(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function dateValue(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function joinedNotes(values) {
  return Array.isArray(values) ? values.map(text).filter(Boolean).join("\n") : text(values);
}

function appendUniqueLine(lines, label, value) {
  const content = joinedNotes(value);
  if (!content) return;
  const line = label ? `${label}：${content}` : content;
  if (!lines.some((item) => item === line || item.includes(content))) lines.push(line);
}

export function creativeRequirementInstructions(task = {}) {
  const lines = [];
  appendUniqueLine(lines, "", task.modificationNotes ?? task.modification_notes ?? task.productionNotes ?? task.production_notes);
  const productionMethod = text(task.productionMethod ?? task.production_method);
  if (productionMethod && productionMethod !== "二创") appendUniqueLine(lines, "制作方式", productionMethod);
  appendUniqueLine(lines, "必须保留", task.mustKeep ?? task.must_keep);
  appendUniqueLine(lines, "禁止内容", task.prohibited ?? task.complianceNotes ?? task.compliance_notes);
  return lines.join("\n");
}

function inferredDeliverable(format) {
  const value = text(format);
  if (/video|视频|shorts|reels|ugc|录屏/i.test(value)) return "视频";
  if (/image|图片|banner|static|海报/i.test(value)) return "图片";
  if (/copy|文案|headline|description/i.test(value)) return "广告文案";
  if (/store|商店|截图|screenshot/i.test(value)) return "商店页资产";
  return "其他";
}

function defaultId() {
  return globalThis.crypto?.randomUUID?.() || `creative-task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeCreativeTask(task = {}, options = {}) {
  const format = text(task.format);
  const makeId = options.makeId || defaultId;
  return {
    id: text(task.id) || makeId(),
    source: GENERATED_SOURCES.has(task.source) || task.source === "manual" ? task.source : "manual",
    sourceKey: text(task.sourceKey),
    platform: text(task.platform) || text(options.defaultPlatform) || "Google Ads",
    market: text(task.market) || text(options.defaultMarket),
    language: text(task.language),
    deliverable: text(task.deliverable) || inferredDeliverable(format),
    format,
    quantity: optionalPositiveInteger(task.quantity ?? task.variants),
    owner: text(task.owner) || "待分配",
    dueDate: dateValue(task.dueDate),
    status: STATUS_VALUES.has(task.status) ? task.status : "backlog",
    angle: text(task.angle),
    hook: text(task.hook),
    hypothesis: text(task.hypothesis),
    testVariable: text(task.testVariable ?? task.variable ?? task.test_variable),
    successMetric: text(task.successMetric ?? task.metric ?? task.success_metric),
    assetLink: text(task.assetLink),
    productionNotes: joinedNotes(task.productionNotes ?? task.production_notes),
    complianceNotes: joinedNotes(task.complianceNotes ?? task.compliance_notes),
    productionMethod: text(task.productionMethod ?? task.production_method) || "二创",
    assetReference: text(own(task, "assetReference", task.asset_reference ?? task.assetLink)),
    copy: text(own(task, "copy", task.hook)),
    modificationNotes: joinedNotes(own(task, "modificationNotes", task.modification_notes ?? task.productionNotes ?? task.production_notes)),
    mustKeep: joinedNotes(own(task, "mustKeep", task.must_keep)),
    prohibited: joinedNotes(own(task, "prohibited", task.complianceNotes ?? task.compliance_notes)),
    aiRationale: text(task.aiRationale ?? task.rationale),
    createdAt: text(task.createdAt) || text(options.now),
    updatedAt: text(task.updatedAt) || text(options.now)
  };
}

export function creativeRequirementFromSuggestion(suggestion = {}, project = {}, options = {}) {
  return normalizeCreativeTask({
    source: "analysis",
    sourceKey: `creative_requirement:${text(suggestion.id)}`,
    angle: suggestion.title || suggestion.modification_notes,
    platform: suggestion.platform || project.platforms?.[0],
    market: suggestion.market || project.markets,
    assetReference: "",
    copy: suggestion.copy,
    modificationNotes: creativeRequirementInstructions(suggestion),
    format: suggestion.format,
    quantity: suggestion.quantity,
    aiRationale: suggestion.rationale
  }, {
    ...options,
    defaultPlatform: project.platforms?.[0],
    defaultMarket: project.markets
  });
}

export function tasksFromCreativeTests(tests = [], project = {}, options = {}) {
  return tests.map((item, index) => normalizeCreativeTask({
    source: options.source || "analysis",
    sourceKey: `${options.source || "analysis"}:${text(item.id) || `${text(item.platform) || "platform"}:${index + 1}`}`,
    platform: item.platform,
    market: project.markets,
    quantity: 1,
    owner: "待分配",
    angle: item.angle,
    hook: item.hook,
    hypothesis: item.hypothesis,
    testVariable: item.variable ?? item.test_variable,
    successMetric: item.success_metric ?? item.metric
  }, {
    ...options,
    defaultPlatform: project.platforms?.[0],
    defaultMarket: project.markets
  }));
}

export function tasksFromCreativeBriefs(briefs = [], project = {}, options = {}) {
  return briefs.map((item, index) => normalizeCreativeTask({
    source: "launch_pack",
    sourceKey: `launch_pack:${text(item.id) || `${text(item.platform) || "platform"}:${index + 1}`}`,
    platform: item.platform,
    market: project.markets,
    format: item.format,
    quantity: item.variants,
    owner: "待分配",
    angle: item.angle,
    hook: item.hook,
    hypothesis: item.hypothesis,
    testVariable: item.test_variable,
    successMetric: item.success_metric,
    productionNotes: item.production_notes,
    complianceNotes: item.compliance_notes
  }, {
    ...options,
    defaultPlatform: project.platforms?.[0],
    defaultMarket: project.markets
  }));
}

export function normalizeCreativeProduction(project = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const settings = {
    ...options,
    now,
    defaultPlatform: project.platforms?.[0],
    defaultMarket: project.markets
  };
  let tasks = project.creativeProduction?.tasks;
  if (!Array.isArray(tasks)) {
    const briefs = project.launch?.pack?.result?.creative_briefs;
    tasks = Array.isArray(briefs) && briefs.length
      ? tasksFromCreativeBriefs(briefs, project, settings)
      : tasksFromCreativeTests(project.creativePlan || [], project, { ...settings, source: "legacy" });
  }
  return {
    mode: MODE_VALUES.has(project.creativeProduction?.mode)
      ? project.creativeProduction.mode
      : tasks.length
        ? "existing"
        : "undecided",
    notes: text(project.creativeProduction?.notes),
    commonRequirements: text(project.creativeProduction?.commonRequirements),
    analysis: project.creativeProduction?.analysis && typeof project.creativeProduction.analysis === "object"
      ? project.creativeProduction.analysis
      : null,
    tasks: tasks.map((task) => normalizeCreativeTask(task, settings)),
    updatedAt: text(project.creativeProduction?.updatedAt) || now
  };
}

export function replaceGeneratedCreativeTasks(currentTasks = [], generatedTasks = [], source, options = {}) {
  const now = options.now || new Date().toISOString();
  const existing = currentTasks.map((task) => normalizeCreativeTask(task, { ...options, now }));
  const generated = generatedTasks.map((task) => normalizeCreativeTask({ ...task, source }, { ...options, now }));
  const preserved = existing.filter((task) => task.source === "manual");
  const previousByKey = new Map(existing.filter((task) => task.sourceKey).map((task) => [task.sourceKey, task]));
  const merged = generated.map((task) => {
    const previous = previousByKey.get(task.sourceKey);
    if (!previous) return task;
    return {
      ...task,
      id: previous.id,
      market: previous.market || task.market,
      language: previous.language,
      deliverable: previous.deliverable || task.deliverable,
      quantity: previous.quantity,
      owner: previous.owner,
      dueDate: previous.dueDate,
      status: previous.status,
      assetLink: previous.assetLink,
      updatedAt: now
    };
  });
  return [...preserved, ...merged];
}

export function legacyCreativePlan(tasks = []) {
  return tasks.map((task) => ({
    angle: text(task.angle),
    hook: text(task.hook),
    platform: text(task.platform),
    variable: text(task.testVariable),
    metric: text(task.successMetric)
  }));
}

export function creativeProductionSummary(tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const normalized = tasks.map((task) => normalizeCreativeTask(task));
  const completed = new Set(["delivered", "live"]);
  return {
    tasks: normalized.length,
    versions: normalized.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0),
    review: normalized.filter((task) => task.status === "review").length,
    completed: normalized.filter((task) => completed.has(task.status)).length,
    overdue: normalized.filter((task) => task.dueDate && task.dueDate < today && !completed.has(task.status)).length
  };
}

function csvCell(value) {
  const string = String(value ?? "");
  return /[",\n\r]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function creativeProductionCsv(tasks = []) {
  const headers = ["素材编号", "素材参考", "文案", "修改要求", "输出规格", "数量需求"];
  const rows = tasks.map((task) => {
    const item = normalizeCreativeTask(task);
    return [item.id, item.assetReference, item.copy, creativeRequirementInstructions(item), item.format, item.quantity ?? ""];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

const FEISHU_TABLE_HEADERS = ["素材编号", "素材参考", "文案", "修改备注", "数量需求"];

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function richCell(value) {
  return String(value ?? "")
    .split(/(https?:\/\/[^\s]+)/g)
    .map((part) => /^https?:\/\//i.test(part)
      ? `<a href="${htmlEscape(part)}">${htmlEscape(part)}</a>`
      : htmlEscape(part))
    .join("")
    .replace(/\r?\n/g, "<br>");
}

function plainCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " / ").trim();
}

function creativeDeliveryRequirement(task) {
  const item = normalizeCreativeTask(task);
  return [item.format, item.quantity === null ? "" : `${item.quantity} 个`].filter(Boolean).join("\n");
}

function creativeRequirementsTableRows(production = {}) {
  const rows = [];
  (Array.isArray(production.tasks) ? production.tasks : []).forEach((task, index) => {
    const item = normalizeCreativeTask(task);
    rows.push([
      `${index + 1}.`,
      item.assetReference,
      item.copy,
      creativeRequirementInstructions(item),
      creativeDeliveryRequirement(item)
    ]);
  });
  return rows;
}

export function creativeRequirementsFeishuTable(production = {}) {
  const rows = creativeRequirementsTableRows(production);
  const tableCellStyle = "text-align:center;vertical-align:middle";
  const header = FEISHU_TABLE_HEADERS.map((item) => `<th style="${tableCellStyle};font-weight:normal">${htmlEscape(item)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((item) => `<td style="${tableCellStyle}">${richCell(item)}</td>`).join("")}</tr>`).join("");
  return {
    html: `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
    text: [FEISHU_TABLE_HEADERS, ...rows].map((row) => row.map(plainCell).join("\t")).join("\r\n")
  };
}

export function creativeProductionMarkdown(project = {}, tasks = [], appVersion = "") {
  void project;
  void appVersion;
  const rows = creativeRequirementsTableRows({ tasks });
  const line = (row) => `| ${row.map((item) => plainCell(item).replaceAll("|", "\\|")).join(" | ")} |`;
  return [line(FEISHU_TABLE_HEADERS), line(FEISHU_TABLE_HEADERS.map(() => "---")), ...rows.map(line)].join("\n");
}
