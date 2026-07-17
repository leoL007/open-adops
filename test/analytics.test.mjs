import test from "node:test";
import assert from "node:assert/strict";
import { calculateMetrics, detectMapping, mapRows, parseCsv } from "../public/lib/analytics.js";

test("parseCsv supports quoted commas and BOM", () => {
  const parsed = parseCsv('\uFEFFPlatform,Campaign,Spend,AF Installs\nMeta Ads,"US, Broad",120.5,40\n');
  assert.deepEqual(parsed.headers, ["Platform", "Campaign", "Spend", "AF Installs"]);
  assert.equal(parsed.rows[0].Campaign, "US, Broad");
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
