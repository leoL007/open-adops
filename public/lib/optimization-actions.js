export const OPTIMIZATION_ACTION_STATUSES = ["pending", "accepted", "executing", "validated", "rejected"];
export const OPTIMIZATION_ACTION_CATEGORIES = ["creative", "tracking", "experiment", "budget", "bidding", "structure", "other"];

const CATEGORY_RULES = [
  ["tracking", /归因|回传|appsflyer|adjust|mmp|sdk|pixel|capi|事件映射|数据口径|安装差异/i],
  ["structure", /campaign|ad group|广告组|账户结构|系列|国家拆分|市场拆分|版位|受众/i],
  ["bidding", /出价|竞价|tcpa|troas|lowest cost|cost cap|bid/i],
  ["budget", /预算|放量|扩量|增量|花费|消耗|allocation/i],
  ["experiment", /实验|测试|单变量|a\/?b|split test|mde|样本/i],
  ["creative", /素材|创意|文案|视频|图片|hook|首帧|ctr|creative/i]
];

const METRIC_RULES = [
  ["afCpi", "AF-CPI", /af[\s_-]*cpi/i],
  ["cpi", "媒体 CPI", /(^|[^a-z])cpi([^a-z]|$)|媒体安装成本/i],
  ["cpa", "CPA", /(^|[^a-z])cpa([^a-z]|$)|转化成本/i],
  ["roas", "ROAS", /roas|广告支出回报/i],
  ["af_installs", "AF 安装", /af[\s_-]*(安装|install)/i],
  ["installs", "媒体安装", /媒体安装|media[\s_-]*install/i],
  ["conversions", "目标转化", /目标转化|转化量|purchase|注册量|付费量/i],
  ["d1Retention", "D1 留存", /d1|次日留存/i],
  ["revenue", "收入", /收入|revenue/i],
  ["spend", "花费", /花费|消耗|spend/i]
];

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableActionId(runId, index) {
  return `${text(runId) || "optimization"}-action-${index + 1}`;
}

export function inferOptimizationActionCategory(value) {
  const content = text(value);
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(content))?.[0] || "other";
}

export function inferOptimizationActionMetric(value) {
  const content = text(value);
  const matched = METRIC_RULES.find(([, , pattern]) => pattern.test(content));
  return matched ? { key: matched[0], label: matched[1] } : null;
}

export function normalizeOptimizationAction(action = {}, options = {}) {
  const content = [action.title, action.action, action.evidence, action.successMetric, action.validation].map(text).join(" ");
  const category = OPTIMIZATION_ACTION_CATEGORIES.includes(action.category)
    ? action.category
    : inferOptimizationActionCategory(content);
  const status = OPTIMIZATION_ACTION_STATUSES.includes(action.status) ? action.status : "pending";
  return {
    id: text(action.id) || stableActionId(options.runId, Number(options.index) || 0),
    title: text(action.title) || text(action.action) || "待确认优化动作",
    category,
    evidence: text(action.evidence) || "暂无可引用的数据证据",
    action: text(action.action) || "待优化师补充",
    owner: text(action.owner) || "优化师",
    timing: text(action.timing) || "待确认",
    successMetric: text(action.successMetric ?? action.success_metric ?? action.validation) || "待确认验证口径",
    status,
    resultNote: text(action.resultNote),
    reviewedAt: text(action.reviewedAt),
    transferredTo: text(action.transferredTo),
    transferredAt: text(action.transferredAt),
    sourceFindingIndex: Number.isInteger(action.sourceFindingIndex) ? action.sourceFindingIndex : null
  };
}

export function actionsFromAnalysis(result = {}, options = {}) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const nextActions = Array.isArray(result.next_actions) ? result.next_actions : [];
  const rows = findings.length
    ? findings.map((finding, index) => {
        const linked = nextActions[index] || {};
        return {
          id: stableActionId(options.runId, index),
          title: finding.title,
          evidence: finding.evidence,
          action: finding.action,
          owner: linked.owner,
          timing: linked.timing,
          successMetric: linked.success_metric || finding.validation,
          sourceFindingIndex: index
        };
      })
    : nextActions.map((action, index) => ({
        id: stableActionId(options.runId, index),
        title: action.action,
        evidence: "来自本次结构化诊断的下一步动作",
        action: action.action,
        owner: action.owner,
        timing: action.timing,
        successMetric: action.success_metric,
        sourceFindingIndex: null
      }));
  return rows.map((action, index) => normalizeOptimizationAction(action, { ...options, index }));
}

export function normalizeOptimizationActions(actions, result = {}, options = {}) {
  const source = Array.isArray(actions) && actions.length ? actions : actionsFromAnalysis(result, options);
  const ids = new Set();
  return source.flatMap((action, index) => {
    const normalized = normalizeOptimizationAction(action, { ...options, index });
    if (!normalized.id || ids.has(normalized.id)) return [];
    ids.add(normalized.id);
    return [normalized];
  });
}

export function updateOptimizationAction(actions, actionId, patch = {}, options = {}) {
  const normalized = normalizeOptimizationActions(actions, {}, options);
  if (!normalized.some((action) => action.id === actionId)) throw new Error("找不到优化动作");
  if (patch.status !== undefined && !OPTIMIZATION_ACTION_STATUSES.includes(patch.status)) {
    throw new Error("优化动作状态无效");
  }
  if (patch.category !== undefined && !OPTIMIZATION_ACTION_CATEGORIES.includes(patch.category)) {
    throw new Error("优化动作分类无效");
  }
  if (patch.status === "validated" && !text(patch.resultNote)) {
    throw new Error("标记为已验证前，请填写验证结论");
  }
  const now = options.now || new Date().toISOString();
  return normalized.map((action) => action.id === actionId
    ? normalizeOptimizationAction({
        ...action,
        ...patch,
        resultNote: patch.resultNote === undefined ? action.resultNote : text(patch.resultNote),
        reviewedAt: now
      }, options)
    : action);
}

export function actionMetricChange(action = {}, baselineSummary = {}, currentSummary = {}) {
  const metric = inferOptimizationActionMetric(`${action.successMetric || ""} ${action.action || ""}`);
  if (!metric) return { available: false, reason: "未识别可计算指标" };
  const baseline = finite(baselineSummary?.[metric.key]);
  const current = finite(currentSummary?.[metric.key]);
  if (baseline === null || current === null) return { available: false, metric, reason: "前后周期缺少该指标" };
  const relativeChange = baseline === 0 ? null : Math.round((((current - baseline) / Math.abs(baseline)) * 100) * 100) / 100;
  return {
    available: true,
    metric,
    baseline,
    current,
    relativeChange,
    trend: current === baseline ? "flat" : current > baseline ? "up" : "down"
  };
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function richCell(value) {
  return htmlEscape(value).replace(/\r?\n/g, "<br>");
}

function plainCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " / ").trim();
}

export function optimizationReviewFeishuTable(actions = [], options = {}) {
  const headers = ["问题", "数据证据", "优化动作", "验证口径", "状态", "验证结论"];
  const statusLabel = options.statusLabel || ((status) => status);
  const rows = actions.map((raw, index) => {
    const action = normalizeOptimizationAction(raw, { index });
    return [
      action.title,
      action.evidence,
      action.action,
      action.successMetric,
      statusLabel(action.status),
      action.resultNote
    ];
  });
  const style = "text-align:center;vertical-align:middle";
  const header = headers.map((item) => `<th style="${style};font-weight:normal">${htmlEscape(item)}</th>`).join("");
  const body = rows.map((row) => `<tr>${row.map((item) => `<td style="${style}">${richCell(item)}</td>`).join("")}</tr>`).join("");
  return {
    html: `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
    text: [headers, ...rows].map((row) => row.map(plainCell).join("\t")).join("\r\n")
  };
}
