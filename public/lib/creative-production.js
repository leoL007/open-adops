export const CREATIVE_TASK_STATUSES = [
  { value: "backlog", label: "待排期" },
  { value: "in_progress", label: "制作中" },
  { value: "review", label: "待审核" },
  { value: "delivered", label: "已交付" },
  { value: "live", label: "已上线" }
];

const STATUS_VALUES = new Set(CREATIVE_TASK_STATUSES.map((item) => item.value));
const GENERATED_SOURCES = new Set(["legacy", "analysis", "launch_pack"]);

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function dateValue(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function joinedNotes(values) {
  return Array.isArray(values) ? values.map(text).filter(Boolean).join("\n") : text(values);
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
    quantity: positiveInteger(task.quantity ?? task.variants),
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
    createdAt: text(task.createdAt) || text(options.now),
    updatedAt: text(task.updatedAt) || text(options.now)
  };
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
    versions: normalized.reduce((sum, task) => sum + task.quantity, 0),
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
  const headers = ["媒体", "市场", "语言", "素材类型", "规格", "数量", "负责人", "截止日期", "状态", "素材角度", "Hook", "测试假设", "单一变量", "成功指标", "素材链接", "制作备注", "合规要求"];
  const statusLabels = new Map(CREATIVE_TASK_STATUSES.map((item) => [item.value, item.label]));
  const rows = tasks.map((task) => {
    const item = normalizeCreativeTask(task);
    return [item.platform, item.market, item.language, item.deliverable, item.format, item.quantity, item.owner, item.dueDate, statusLabels.get(item.status), item.angle, item.hook, item.hypothesis, item.testVariable, item.successMetric, item.assetLink, item.productionNotes, item.complianceNotes];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function creativeProductionMarkdown(project = {}, tasks = [], appVersion = "") {
  const statusLabels = new Map(CREATIVE_TASK_STATUSES.map((item) => [item.value, item.label]));
  const lines = [
    `# ${text(project.name) || "OpenAdOps"} · 素材生产计划`,
    "",
    `- 市场：${text(project.markets) || "待确认"}`,
    `- 媒体：${Array.isArray(project.platforms) ? project.platforms.join(" / ") : "待确认"}`,
    `- 导出版本：OpenAdOps v${appVersion || "—"}`,
    ""
  ];
  tasks.forEach((rawTask, index) => {
    const task = normalizeCreativeTask(rawTask);
    lines.push(
      `## ${String(index + 1).padStart(2, "0")} · ${task.platform} · ${task.angle || "未命名任务"}`,
      "",
      `- 市场 / 语言：${task.market || "待确认"} / ${task.language || "待确认"}`,
      `- 交付：${task.deliverable} · ${task.format || "规格待确认"} · ${task.quantity} 个版本`,
      `- 负责人 / 截止：${task.owner} / ${task.dueDate || "待确认"}`,
      `- 状态：${statusLabels.get(task.status)}`,
      `- Hook：${task.hook || "待补充"}`,
      `- 测试假设：${task.hypothesis || "待补充"}`,
      `- 单一变量：${task.testVariable || "待补充"}`,
      `- 成功指标：${task.successMetric || "观察期，暂无阈值"}`,
      `- 素材链接：${task.assetLink || "待补充"}`,
      `- 制作备注：${task.productionNotes || "无"}`,
      `- 合规要求：${task.complianceNotes || "无"}`,
      ""
    );
  });
  return lines.join("\n");
}
