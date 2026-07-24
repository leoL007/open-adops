import test from "node:test";
import assert from "node:assert/strict";
import {
  appendOptimizationRun,
  buildOptimizationRun,
  normalizeOptimizationHistory,
  updateOptimizationRun
} from "../public/lib/optimization-history.js";

const record = {
  source: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  generatedAt: "2026-07-20T08:00:00.000Z",
  result: {
    executive_summary: "先验证 AF-CPI 变化。",
    findings: [],
    next_actions: []
  }
};

const data = {
  fileName: "af-report.csv",
  importedAt: "2026-07-20T07:00:00.000Z",
  availableFields: ["spend", "installs", "af_installs"],
  metrics: {
    period: { start: "2026-07-13", end: "2026-07-19" },
    summary: { spend: 1200, installs: 540, af_installs: 480, afCpi: 2.5 }
  },
  comparison: {
    ranges: {
      previousStart: "2026-07-06",
      previousEnd: "2026-07-12",
      currentStart: "2026-07-13",
      currentEnd: "2026-07-19"
    }
  },
  dateQuality: { totalRows: 7, validRows: 6, invalidRows: 1, rawDates: ["must-not-be-stored"] },
  numericQuality: { checkedFields: 5, invalidCells: 0, blankCells: 2, rawCells: ["must-not-be-stored"] },
  rawRows: [{ customer: "must-not-be-stored" }]
};

test("buildOptimizationRun stores only an aggregate data snapshot", () => {
  const run = buildOptimizationRun(record, data, { id: "run-1" });
  assert.equal(run.id, "run-1");
  assert.equal(run.dataContext.summary.af_installs, 480);
  assert.equal(run.dataContext.summary.installs, 540);
  assert.deepEqual(run.dataContext.dateQuality, { totalRows: 7, validRows: 6, invalidRows: 1 });
  assert.deepEqual(run.dataContext.numericQuality, { checkedFields: 5, invalidCells: 0, blankCells: 2 });
  assert.equal(run.dataContext.dateQuality.rawDates, undefined);
  assert.equal(run.dataContext.numericQuality.rawCells, undefined);
  assert.equal(run.dataContext.rawRows, undefined);
  assert.equal(run.status, "pending");
});

test("appendOptimizationRun keeps the newest diagnosis first", () => {
  const older = buildOptimizationRun(record, data, { id: "old" });
  const runs = appendOptimizationRun([older], {
    ...record,
    generatedAt: "2026-07-20T09:00:00.000Z"
  }, data, { id: "new" });
  assert.deepEqual(runs.map((run) => run.id), ["new", "old"]);
});

test("updateOptimizationRun records manual status and conclusion", () => {
  const run = buildOptimizationRun(record, data, { id: "run-1" });
  const [updated] = updateOptimizationRun([run], "run-1", {
    status: "validated",
    note: "  AF-CPI 下降，量级稳定。  "
  }, { now: "2026-07-21T00:00:00.000Z" });
  assert.equal(updated.status, "validated");
  assert.equal(updated.note, "AF-CPI 下降，量级稳定。");
  assert.equal(updated.reviewedAt, "2026-07-21T00:00:00.000Z");
});

test("updateOptimizationRun rejects unknown statuses", () => {
  const run = buildOptimizationRun(record, data, { id: "run-1" });
  assert.throws(() => updateOptimizationRun([run], "run-1", { status: "done" }), /状态无效/);
});

test("normalizeOptimizationHistory drops malformed and duplicate entries", () => {
  const run = buildOptimizationRun(record, data, { id: "run-1" });
  const normalized = normalizeOptimizationHistory([run, { ...run }, { id: "broken" }, null]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, "run-1");
  assert.deepEqual(normalized[0].dataContext.numericQuality, { checkedFields: 5, invalidCells: 0, blankCells: 2 });
});
