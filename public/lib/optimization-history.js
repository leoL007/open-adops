export const OPTIMIZATION_RUN_STATUSES = ["pending", "accepted", "executing", "validated", "rejected"];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value || "").trim();
}

function validStatus(value) {
  return OPTIMIZATION_RUN_STATUSES.includes(value) ? value : "pending";
}

function dataContext(data = {}) {
  const metrics = data.metrics || {};
  return {
    sourceFile: text(data.fileName),
    importedAt: text(data.importedAt),
    period: clone(metrics.period || null),
    comparisonRanges: clone(data.comparison?.ranges || null),
    availableFields: Array.isArray(data.availableFields) ? [...data.availableFields] : [],
    summary: clone(metrics.summary || {})
  };
}

export function buildOptimizationRun(record, data = {}, options = {}) {
  if (!record?.result || typeof record.result !== "object") {
    throw new Error("优化诊断结果不能为空");
  }
  const now = options.now || new Date().toISOString();
  return {
    id: text(options.id || record.id) || options.makeId?.() || `optimization-${Date.now()}`,
    generatedAt: text(record.generatedAt) || now,
    source: text(record.source) || "unknown",
    model: text(record.model),
    reasoningEffort: text(record.reasoningEffort),
    durationMs: Math.max(0, Number(record.durationMs || 0)),
    fallbackUsed: Boolean(record.fallbackUsed),
    routeKey: text(record.routeKey),
    status: validStatus(record.status),
    reviewedAt: text(record.reviewedAt),
    note: text(record.note),
    dataContext: dataContext(data),
    result: clone(record.result)
  };
}

export function normalizeOptimizationHistory(history) {
  if (!Array.isArray(history)) return [];
  const ids = new Set();
  return history.flatMap((run) => {
    if (!run?.id || !run?.result || ids.has(run.id)) return [];
    ids.add(run.id);
    return [{
      id: text(run.id),
      generatedAt: text(run.generatedAt),
      source: text(run.source) || "unknown",
      model: text(run.model),
      reasoningEffort: text(run.reasoningEffort),
      durationMs: Math.max(0, Number(run.durationMs || 0)),
      fallbackUsed: Boolean(run.fallbackUsed),
      routeKey: text(run.routeKey),
      status: validStatus(run.status),
      reviewedAt: text(run.reviewedAt),
      note: text(run.note),
      dataContext: dataContext({
        fileName: run.dataContext?.sourceFile,
        importedAt: run.dataContext?.importedAt,
        metrics: {
          period: run.dataContext?.period,
          summary: run.dataContext?.summary
        },
        comparison: { ranges: run.dataContext?.comparisonRanges },
        availableFields: run.dataContext?.availableFields
      }),
      result: clone(run.result)
    }];
  });
}

export function appendOptimizationRun(history, record, data = {}, options = {}) {
  const run = buildOptimizationRun(record, data, options);
  return [run, ...normalizeOptimizationHistory(history).filter((item) => item.id !== run.id)];
}

export function updateOptimizationRun(history, runId, patch = {}, options = {}) {
  const runs = normalizeOptimizationHistory(history);
  if (!runs.some((run) => run.id === runId)) throw new Error("找不到优化诊断记录");
  if (patch.status !== undefined && !OPTIMIZATION_RUN_STATUSES.includes(patch.status)) {
    throw new Error("优化诊断状态无效");
  }
  const reviewedAt = options.now || new Date().toISOString();
  return runs.map((run) => run.id === runId
    ? {
        ...run,
        status: patch.status === undefined ? run.status : patch.status,
        note: patch.note === undefined ? run.note : text(patch.note),
        reviewedAt
      }
    : run);
}
