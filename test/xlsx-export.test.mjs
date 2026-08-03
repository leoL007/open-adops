import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeRequirementsWorkbook, buildStrategyWorkbook, creativeRequirementsWorkbookDownload, strategyWorkbookDownload } from "../public/lib/xlsx-export.js";

function zipEntries(bytes) {
  const entries = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}

const project = {
  name: "Bifu 金融",
  stage: "测试期",
  goal: "Purchase",
  attribution: "Adjust",
  budget: 9000,
  currency: "USD",
  platforms: ["TikTok Ads"],
  markets: "BR, VN"
};

const strategy = {
  enabled: true,
  budgetShares: { "TikTok Ads": 100 },
  campaign: { os: "Android", primaryEvent: "First Deposit", placements: "媒体默认版位" },
  adGroups: [{
    id: "g1",
    name: "BR_Android_Deposit_01",
    platform: "TikTok Ads",
    market: "BR",
    language: "葡语",
    optimizationEvent: "First Deposit",
    bidding: "自动出价",
    placements: "自动版位",
    exclusions: "已入金用户",
    creativeDirection: "快速入金与交易效率",
    assetCount: 5
  }],
  ad: { firstLaunchAssets: 5, totalAssets: 15, splitRule: "先按素材方向拆分", iterationMetrics: "CTR、AF-CPA", reportingMetrics: "花费、入金、CPA" },
  notes: "测试账户先小额跑量"
};

test("strategy workbook is a real xlsx package with the build sheet content", () => {
  const bytes = buildStrategyWorkbook(project, strategy, { appVersion: "0.5.12" });
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const entries = zipEntries(bytes);
  assert.ok(entries.has("[Content_Types].xml"));
  assert.ok(entries.has("xl/workbook.xml"));
  assert.ok(entries.has("xl/worksheets/sheet1.xml"));
  const sheet = new TextDecoder().decode(entries.get("xl/worksheets/sheet1.xml"));
  assert.match(sheet, /Campaign 层级/);
  assert.match(sheet, /Ad group 搭建矩阵/);
  assert.match(sheet, /BR_Android_Deposit_01/);
  assert.match(sheet, /First Deposit/);
  assert.match(sheet, /IFERROR\(\$H\$4\*B/);
});

test("strategy workbook download uses xlsx metadata and a sanitized file name", () => {
  const output = strategyWorkbookDownload({ ...project, name: "A/B:策略" }, strategy);
  assert.equal(output.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(output.fileName, "A-B-策略-搭建策略.xlsx");
  assert.ok(output.bytes.length > 1000);
});

test("creative requirements workbook contains guidance and confirmed requirements", () => {
  const production = {
    mode: "new",
    notes: "参考竞品口播",
    analysis: { result: { guidance: [{ status: "required", category: "casting", item: "使用成年演员", reason: "避免年龄风险" }] } },
    tasks: [{
      angle: "真人口播＋尾板",
      assetReference: "ref-01.mp4",
      productionMethod: "二创",
      copy: "Start a chat nearby.",
      modificationNotes: "结尾加品牌尾板",
      platform: "Meta Ads",
      market: "US",
      language: "英语",
      deliverable: "视频",
      format: "9:16 · 15 秒",
      quantity: 5,
      mustKeep: "品牌尾板",
      prohibited: "未成年人暗示"
    }]
  };
  const bytes = buildCreativeRequirementsWorkbook({ ...project, name: "LocalSingle", industry: "社交", platforms: ["Meta Ads"], markets: "US" }, production, { appVersion: "0.5.12" });
  const entries = zipEntries(bytes);
  const sheet = new TextDecoder().decode(entries.get("xl/worksheets/sheet1.xml"));
  assert.match(sheet, /AI 必知事项/);
  assert.match(sheet, /真人口播＋尾板/);
  assert.match(sheet, /使用成年演员/);
  assert.match(sheet, /ref-01.mp4/);
});

test("creative requirements download uses xlsx metadata", () => {
  const output = creativeRequirementsWorkbookDownload({ ...project, name: "Local/Single" }, { tasks: [{ angle: "A" }] });
  assert.equal(output.mime, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(output.fileName, "Local-Single-素材需求.xlsx");
  assert.ok(output.bytes.length > 1000);
});
