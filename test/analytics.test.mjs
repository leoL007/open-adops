import test from "node:test";
import assert from "node:assert/strict";
import { calculateMetrics, detectMapping, mapRows, parseCsv } from "../public/lib/analytics.js";

test("parseCsv supports quoted commas and BOM", () => {
  const parsed = parseCsv('\uFEFFPlatform,Campaign,Spend,AF Installs\nMeta Ads,"US, Broad",120.5,40\n');
  assert.deepEqual(parsed.headers, ["Platform", "Campaign", "Spend", "AF Installs"]);
  assert.equal(parsed.rows[0].Campaign, "US, Broad");
});

test("detectMapping recognizes common media and AppsFlyer fields", () => {
  const mapping = detectMapping(["Media", "Country", "Amount Spent", "Clicks", "Media Installs", "AF Installs"]);
  assert.equal(mapping.platform, "Media");
  assert.equal(mapping.country, "Country");
  assert.equal(mapping.spend, "Amount Spent");
  assert.equal(mapping.installs, "Media Installs");
  assert.equal(mapping.af_installs, "AF Installs");
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
  assert.equal(metrics.byPlatform.length, 2);
});
