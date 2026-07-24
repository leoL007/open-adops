export const PERFORMANCE_TARGET_METRICS = [
  { value: "media_cpi", label: "媒体 CPI", direction: "decrease", symbol: "≤", unit: "currency" },
  { value: "af_cpi", label: "AF-CPI", direction: "decrease", symbol: "≤", unit: "currency" },
  { value: "cpa", label: "CPA", direction: "decrease", symbol: "≤", unit: "currency" },
  { value: "roas", label: "ROAS", direction: "increase", symbol: "≥", unit: "ratio" }
];

export const PERFORMANCE_TARGET_STATUSES = [
  { value: "observe", label: "仅观察" },
  { value: "test", label: "测试阈值" },
  { value: "formal", label: "正式目标" }
];

const METRIC_BY_VALUE = new Map(PERFORMANCE_TARGET_METRICS.map((item) => [item.value, item]));
const STATUS_BY_VALUE = new Map(PERFORMANCE_TARGET_STATUSES.map((item) => [item.value, item]));
const ROAS_WINDOWS = new Set(["D0", "D1", "D7", "D30"]);

export function equalBudgetShares(platforms) {
  const uniquePlatforms = [...new Set(
    (Array.isArray(platforms) ? platforms : [])
      .map((platform) => String(platform || "").trim())
      .filter(Boolean)
  )];
  if (!uniquePlatforms.length) return {};
  const baseShare = Math.floor(100 / uniquePlatforms.length);
  const remainder = 100 - baseShare * uniquePlatforms.length;
  return Object.fromEntries(
    uniquePlatforms.map((platform, index) => [platform, baseShare + (index < remainder ? 1 : 0)])
  );
}

function positiveNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function legacyTargets(project) {
  const candidates = [
    { metric: "af_cpi", value: positiveNumber(project?.targetCpi) },
    { metric: "cpa", value: positiveNumber(project?.targetCpa), event: ["Registration", "Purchase"].includes(project?.goal) ? project.goal : "" },
    { metric: "roas", value: positiveNumber(project?.targetRoas), window: "" }
  ].filter((item) => item.value !== null);

  return candidates.map((item, index) => ({
    id: `legacy-${item.metric}`,
    metric: item.metric,
    status: "test",
    value: item.value,
    event: item.event || "",
    window: item.window || "",
    primary: index === 0
  }));
}

export function normalizePerformanceTargets(project, { makeId } = {}) {
  const source = Array.isArray(project?.performanceTargets) ? project.performanceTargets : legacyTargets(project);
  const metrics = new Set();
  const ids = new Set();
  let primaryAssigned = false;
  const targets = [];

  for (const [index, raw] of source.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !METRIC_BY_VALUE.has(raw.metric) || metrics.has(raw.metric)) continue;
    metrics.add(raw.metric);
    let id = String(raw.id || "").trim();
    if (!id || ids.has(id)) id = typeof makeId === "function" ? makeId() : `target-${raw.metric}-${index + 1}`;
    ids.add(id);
    const status = STATUS_BY_VALUE.has(raw.status) ? raw.status : "observe";
    const primary = Boolean(raw.primary) && !primaryAssigned;
    if (primary) primaryAssigned = true;
    targets.push({
      id,
      metric: raw.metric,
      status,
      value: status === "observe" ? null : positiveNumber(raw.value),
      event: raw.metric === "cpa" ? String(raw.event || "").trim() : "",
      window: raw.metric === "roas" && ROAS_WINDOWS.has(raw.window) ? raw.window : "",
      primary
    });
  }

  if (targets.length && !primaryAssigned) targets[0].primary = true;
  return targets;
}

export function performanceTargetsForAi(project) {
  const targets = normalizePerformanceTargets(project);
  return {
    status: targets.length ? "configured" : "missing",
    reviewCondition: String(project?.targetReview || "").trim() || null,
    items: targets.map((target) => {
      const metric = METRIC_BY_VALUE.get(target.metric);
      return {
        metric: target.metric,
        label: metric.label,
        role: target.primary ? "primary" : "guardrail",
        status: target.status,
        value: target.value,
        direction: metric.direction,
        currency: metric.unit === "currency" ? project?.currency || "USD" : null,
        event: target.metric === "cpa" ? target.event || null : null,
        window: target.metric === "roas" ? target.window || null : null
      };
    })
  };
}

function targetValueText(target, currency) {
  const metric = METRIC_BY_VALUE.get(target.metric);
  if (!metric || target.value === null) return "";
  if (metric.unit === "ratio") return `${metric.symbol} ${target.value}x`;
  return `${metric.symbol} ${currency || "USD"} ${target.value}`;
}

export function targetHint(project, metricValue) {
  const target = normalizePerformanceTargets(project).find((item) => item.metric === metricValue);
  if (!target) return "暂未设置目标 · 学习期";
  const status = STATUS_BY_VALUE.get(target.status)?.label || "仅观察";
  if (target.status === "observe") return `${status} · 暂无阈值`;
  const value = targetValueText(target, project?.currency);
  return value ? `${status} ${value}` : `${status} · 阈值待填写`;
}

export function primaryTargetText(project) {
  const targets = normalizePerformanceTargets(project);
  const target = targets.find((item) => item.primary) || targets[0];
  if (!target) return "";
  const metric = METRIC_BY_VALUE.get(target.metric);
  const qualifier = target.metric === "cpa" && target.event
    ? `${target.event} `
    : target.metric === "roas" && target.window
      ? `${target.window} `
      : "";
  if (target.status === "observe") return `${qualifier}${metric.label} 仅观察，暂无阈值`;
  const value = targetValueText(target, project?.currency);
  const status = STATUS_BY_VALUE.get(target.status)?.label || "测试阈值";
  return value ? `${qualifier}${metric.label} ${status} ${value}` : `${qualifier}${metric.label} ${status}待填写`;
}
