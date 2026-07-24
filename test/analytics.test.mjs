import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDateQuality,
  calculateMetrics,
  calculatePeriodComparison,
  defaultComparisonRanges,
  detectMapping,
  filterRowsByDate,
  formatMetric,
  mapRows,
  normalizeDate,
  parseCsv
} from "../public/lib/analytics.js";

test("parseCsv supports quoted commas and BOM", () => {
  const parsed = parseCsv('\uFEFFPlatform,Campaign,Spend,AF Installs\nMeta Ads,"US, Broad",120.5,40\n');
  assert.deepEqual(parsed.headers, ["Platform", "Campaign", "Spend", "AF Installs"]);
  assert.equal(parsed.rows[0].Campaign, "US, Broad");
});

test("parseCsv rejects structures that would silently overwrite or swallow data", () => {
  assert.throws(
    () => parseCsv("Spend,spend,AF Installs\n10,999,5\n"),
    /表头重复/
  );
  assert.throws(
    () => parseCsv('Spend,Campaign,AF Installs\n10,"Broken\n20,Good,4\n'),
    /未闭合的引号/
  );
});

test("detectMapping recognizes common media and AppsFlyer fields", () => {
  const mapping = detectMapping(["Media", "Country", "Amount Spent", "Clicks", "Media Installs", "AF Installs", "Event Name"]);
  assert.equal(mapping.platform, "Media");
  assert.equal(mapping.country, "Country");
  assert.equal(mapping.spend, "Amount Spent");
  assert.equal(mapping.installs, "Media Installs");
  assert.equal(mapping.af_installs, "AF Installs");
  assert.equal(mapping.conversion_event, "Event Name");
});

test("detectMapping does not bind AF-only install columns to media installs", () => {
  const afOnly = detectMapping(["Date", "Platform", "Spend", "Clicks", "AF Installs"]);
  assert.equal(afOnly.af_installs, "AF Installs");
  assert.equal(afOnly.installs, "");

  const appsFlyerOnly = detectMapping(["Date", "Platform", "Spend", "Clicks", "AppsFlyer Installs"]);
  assert.equal(appsFlyerOnly.af_installs, "AppsFlyer Installs");
  assert.equal(appsFlyerOnly.installs, "");

  const both = detectMapping(["Date", "Platform", "Spend", "Clicks", "Media Installs", "AF Installs"]);
  assert.equal(both.installs, "Media Installs");
  assert.equal(both.af_installs, "AF Installs");
});

test("calculateMetrics keeps media CPI and AF-CPI separate", () => {
  const parsed = parseCsv("Platform,Country,Spend,Impressions,Clicks,Media Installs,AF Installs,Revenue,D1 Retained\nGoogle Ads,JP,100,10000,500,100,80,150,20\nMeta Ads,US,200,20000,600,120,100,180,25\n");
  const rows = mapRows(parsed.rows, detectMapping(parsed.headers));
  const metrics = calculateMetrics(rows);
  assert.equal(metrics.summary.spend, 300);
  assert.equal(metrics.summary.installs, 220);
  assert.equal(metrics.summary.af_installs, 180);
  assert.equal(metrics.summary.cpi, 300 / 220);
  assert.equal(metrics.summary.afCpi, 300 / 180);
  assert.equal(metrics.summary.roas, 330 / 300);
  assert.equal(metrics.period.activeDays, 0);
  assert.equal(metrics.byPlatform.length, 2);
});

test("zero denominators stay unavailable instead of becoming fake zero efficiency", () => {
  const parsed = parseCsv("Platform,Spend,Impressions,Clicks,Media Installs,AF Installs,Conversions,Revenue\nMeta Ads,100,0,0,0,0,0,0\n");
  const metrics = calculateMetrics(mapRows(parsed.rows, detectMapping(parsed.headers)));
  for (const metric of ["ctr", "cvr", "cpi", "afCpi", "cpa", "d1Retention"]) {
    assert.equal(metrics.summary[metric], null, `${metric} should be unavailable`);
  }
  assert.equal(metrics.summary.roas, 0);
  assert.equal(formatMetric(null, "currency"), "—");
  assert.equal(formatMetric(0, "currency", "USD"), "US$0.00");
});

test("calculateMetrics records active dates for experiment sizing", () => {
  const parsed = parseCsv("Date,Platform,Spend,Clicks,AF Installs\n2026-07-01,Meta Ads,100,500,80\n2026-07-02,Meta Ads,120,600,90\n2026-07-02,Google Ads,90,400,70\n");
  const metrics = calculateMetrics(mapRows(parsed.rows, detectMapping(parsed.headers)));
  assert.deepEqual(metrics.period, {
    startDate: "2026-07-01",
    endDate: "2026-07-02",
    activeDays: 2,
    dates: ["2026-07-01", "2026-07-02"]
  });
  assert.equal(metrics.byPlatform.find((item) => item.name === "Meta Ads").period.activeDays, 2);
  assert.equal(metrics.byPlatform.find((item) => item.name === "Google Ads").period.activeDays, 1);
});

test("calculateMetrics counts timestamped rows by calendar day", () => {
  const parsed = parseCsv("Date,Platform,Clicks,AF Installs\n2026-07-01T09:00:00+08:00,Meta Ads,100,10\n2026-07-01 18:00:00,Meta Ads,120,12\n2026/07/02 08:00:00,Meta Ads,130,13\n");
  const metrics = calculateMetrics(mapRows(parsed.rows, detectMapping(parsed.headers)));
  assert.deepEqual(metrics.period, {
    startDate: "2026-07-01",
    endDate: "2026-07-02",
    activeDays: 2,
    dates: ["2026-07-01", "2026-07-02"]
  });
  assert.equal(metrics.byPlatform[0].period.activeDays, 2);
});

test("calculateMetrics preserves one declared conversion event per aggregate", () => {
  const parsed = parseCsv("Date,Platform,Clicks,Conversions,Event Name\n2026-07-01,Meta Ads,100,8,Registration\n2026-07-02,Meta Ads,120,9,Registration\n");
  const metrics = calculateMetrics(mapRows(parsed.rows, detectMapping(parsed.headers)));
  assert.equal(metrics.summary.conversionEvent, "Registration");
  assert.equal(metrics.byPlatform[0].conversionEvent, "Registration");
});

test("date helpers normalize dates and build equal active-day windows", () => {
  assert.equal(normalizeDate("2026/07/02 08:00:00"), "2026-07-02");
  assert.equal(normalizeDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeDate("2026-02-29"), "");
  assert.equal(normalizeDate("2026-02-30"), "");
  assert.equal(normalizeDate("2026-13-01"), "");
  assert.equal(normalizeDate("not-a-date"), "");
  const rows = ["2026-07-01", "2026-07-02", "2026-02-30", "2026-07-03", "2026-07-04", "2026-07-05"]
    .map((date) => ({ date }));
  assert.deepEqual(defaultComparisonRanges(rows), {
    previousStart: "2026-07-02",
    previousEnd: "2026-07-03",
    currentStart: "2026-07-04",
    currentEnd: "2026-07-05"
  });
  assert.equal(filterRowsByDate(rows, "2026-07-03", "2026-07-04").length, 2);
  assert.equal(filterRowsByDate(rows, "2026-02-01", "2026-03-01").length, 0);
});

test("date quality exposes invalid rows without changing aggregate evidence", () => {
  assert.deepEqual(calculateDateQuality([
    { date: "2026-07-01" },
    { date: "2026-02-30" },
    { date: "" }
  ]), {
    totalRows: 3,
    validRows: 1,
    invalidRows: 2
  });
});

test("period comparison keeps exact metric identities and calculates deterministic changes", () => {
  const parsed = parseCsv("Date,Spend,Media Installs,AF Installs,Conversions,Revenue\n2026-07-01,100,50,40,10,120\n2026-07-02,120,60,48,12,144\n2026-07-03,150,60,50,15,210\n2026-07-04,180,72,60,18,270\n");
  const mapping = detectMapping(parsed.headers);
  const rows = mapRows(parsed.rows, mapping);
  const comparison = calculatePeriodComparison(rows, defaultComparisonRanges(rows), {
    availableFields: Object.keys(mapping).filter((field) => mapping[field])
  });
  assert.equal(comparison.available, true);
  assert.equal(comparison.previous.summary.installs, 110);
  assert.equal(comparison.previous.summary.af_installs, 88);
  assert.equal(comparison.current.summary.installs, 132);
  assert.equal(comparison.current.summary.af_installs, 110);
  assert.equal(comparison.changes.cpi.assessment, "negative");
  assert.equal(comparison.changes.afCpi.assessment, "negative");
  assert.equal(comparison.changes.roas.assessment, "positive");
  assert.equal(comparison.changes.spend.assessment, "neutral");
});

test("period comparison omits metrics whose source columns were not mapped", () => {
  const rows = [
    { date: "2026-07-01", spend: 100, af_installs: 20, installs: 0, revenue: 0 },
    { date: "2026-07-02", spend: 120, af_installs: 30, installs: 0, revenue: 0 }
  ];
  const comparison = calculatePeriodComparison(rows, defaultComparisonRanges(rows), {
    availableFields: ["date", "spend", "af_installs"]
  });
  assert.ok(comparison.availableMetrics.includes("af_installs"));
  assert.ok(comparison.availableMetrics.includes("afCpi"));
  assert.ok(!comparison.availableMetrics.includes("installs"));
  assert.ok(!comparison.availableMetrics.includes("cpi"));
  assert.ok(!comparison.availableMetrics.includes("roas"));
});

test("period comparison rejects overlapping windows without blocking empty-window summaries", () => {
  const rows = [{ date: "2026-07-01", spend: 100 }, { date: "2026-07-02", spend: 120 }];
  assert.throws(() => calculatePeriodComparison(rows, {
    previousStart: "2026-07-01",
    previousEnd: "2026-07-02",
    currentStart: "2026-07-02",
    currentEnd: "2026-07-03"
  }, { availableFields: ["date", "spend"] }), /不能重叠/);
  const empty = calculatePeriodComparison(rows, {
    previousStart: "2026-06-01",
    previousEnd: "2026-06-02",
    currentStart: "2026-07-01",
    currentEnd: "2026-07-02"
  }, { availableFields: ["date", "spend"] });
  assert.equal(empty.available, false);
  assert.match(empty.reason, /没有数据/);
});

test("period comparison marks zero-denominator efficiency as unavailable", () => {
  const rows = [
    { date: "2026-07-01", spend: 100, af_installs: 0 },
    { date: "2026-07-02", spend: 120, af_installs: 20 }
  ];
  const comparison = calculatePeriodComparison(rows, defaultComparisonRanges(rows), {
    availableFields: ["date", "spend", "af_installs"]
  });
  assert.equal(comparison.changes.afCpi.trend, "unavailable");
  assert.equal(comparison.changes.afCpi.relativeChange, null);
});
