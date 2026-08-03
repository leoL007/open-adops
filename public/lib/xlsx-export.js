const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const encoder = new TextEncoder();

function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function cellXml(cell, rowIndex, columnIndex) {
  const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
  const style = Number.isInteger(cell?.style) ? ` s="${cell.style}"` : "";
  if (cell?.formula) {
    return `<c r="${ref}"${style}><f>${xml(cell.formula)}</f><v>${Number(cell.value) || 0}</v></c>`;
  }
  if (typeof cell?.value === "number" && Number.isFinite(cell.value)) {
    return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  }
  const value = cell?.value ?? "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function worksheetXml(rows, merges, widths) {
  const rowXml = rows.map((row, rowIndex) => {
    const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
    const cells = row.cells.map((cell, columnIndex) => cellXml(cell, rowIndex, columnIndex)).join("");
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join("");
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${rowXml}</sheetData>
  ${mergeXml}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
  <fonts count="4">
    <font><sz val="10"/><name val="Aptos"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="15"/><name val="Aptos Display"/></font>
    <font><b/><sz val="10"/><name val="Aptos"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1B2430"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF0F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF5DF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD7DCE2"/></left><right style="thin"><color rgb="FFD7DCE2"/></right><top style="thin"><color rgb="FFD7DCE2"/></top><bottom style="thin"><color rgb="FFD7DCE2"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const checksum = crc32(data);
    const local = concat([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), nameBytes, data
    ]);
    const central = concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(checksum), uint32(data.length), uint32(data.length), uint16(nameBytes.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), nameBytes
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const central = concat(centralParts);
  const end = concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(files.length), uint16(files.length),
    uint32(central.length), uint32(offset), uint16(0)
  ]);
  return concat([...localParts, central, end]);
}

function cell(value = "", style = 4, extra = {}) {
  return { value, style, ...extra };
}

function padded(values, size = 11) {
  const cells = values.map((value) => value && typeof value === "object" && "value" in value ? value : cell(value));
  while (cells.length < size) cells.push(cell("", 4));
  return cells;
}

function safeFileName(value) {
  return String(value || "未命名项目").replace(/[\\/:*?"<>|]/g, "-").trim() || "未命名项目";
}

export function buildStrategyWorkbook(project = {}, strategy = {}, { appVersion = "" } = {}) {
  const campaign = strategy.campaign || {};
  const ad = strategy.ad || {};
  const groups = Array.isArray(strategy.adGroups) ? strategy.adGroups : [];
  const budget = Number(project.budget) || 0;
  const currency = project.currency || "USD";
  const rows = [];
  const merges = [];
  const add = (values, height = 22) => rows.push({ cells: padded(values), height });
  const section = (title) => {
    const rowNumber = rows.length + 1;
    add([cell(title, 2)], 24);
    merges.push(`A${rowNumber}:K${rowNumber}`);
  };
  const pairRow = (pairs) => {
    const values = [];
    pairs.forEach(([label, value, valueStyle = 8]) => values.push(cell(label, 3), cell(value, valueStyle)));
    add(values, 30);
  };

  add([cell(`${project.name || "未命名项目"} · 搭建策略`, 1)], 34);
  merges.push("A1:K1");
  add([cell(`OpenAdOps${appVersion ? ` v${appVersion}` : ""} · ${new Date().toISOString().slice(0, 10)} · 本表仅用于搭建与复盘，不会修改广告账户`, 0)], 22);
  merges.push("A2:K2");

  section("Campaign 层级");
  pairRow([["项目阶段", project.stage || ""], ["主要目标", project.goal || ""], ["归因来源", project.attribution || ""], ["月预算", budget, 6], ["币种", currency]]);
  pairRow([["投放媒体", (project.platforms || []).join(" / ")], ["目标市场", project.markets || ""], ["操作系统", campaign.os || ""], ["语言", campaign.language || ""], ["Campaign 命名", campaign.name || ""]]);
  pairRow([["商店链接", campaign.storeUrl || ""], ["主要事件", campaign.primaryEvent || ""], ["辅助事件", campaign.supportingEvents || ""], ["出价方式", campaign.bidStrategy || ""], ["版位", campaign.placements || ""]]);
  pairRow([["排除条件", campaign.exclusions || ""], ["特殊限制", strategy.notes || ""], ["", ""], ["", ""], ["", ""]]);

  section("媒体预算");
  add([cell("媒体", 5), cell("占比 (%)", 5), cell(`月预算 (${currency})`, 5), ...Array.from({ length: 8 }, () => cell("", 5))], 27);
  const budgetStart = rows.length + 1;
  (project.platforms || []).forEach((platform, index) => {
    const share = Number(strategy.budgetShares?.[platform]) || 0;
    const rowNumber = budgetStart + index;
    add([
      cell(platform, 4),
      cell(share, 7),
      cell((budget * share) / 100, 6, { formula: `IFERROR($H$4*B${rowNumber}/100,0)` })
    ]);
  });

  section("Ad group 搭建矩阵");
  add(["序号", "Ad group 名称", "媒体", "市场", "语言", "优化事件", "出价", "版位", "排除条件", "素材方向", "素材数"].map((value) => cell(value, 5)), 30);
  if (groups.length) {
    groups.forEach((group, index) => add([
      cell(index + 1, 4), cell(group.name || "", 8), cell(group.platform || "", 8), cell(group.market || "", 8),
      cell(group.language || "", 8), cell(group.optimizationEvent || "", 8), cell(group.bidding || "", 8),
      cell(group.placements || "", 8), cell(group.exclusions || "", 8), cell(group.creativeDirection || "", 8),
      cell(Number(group.assetCount) || 0, 4)
    ], 42));
  } else {
    add([cell("尚未添加 Ad group", 8)], 30);
    merges.push(`A${rows.length}:K${rows.length}`);
  }

  section("Ad 与复盘规则");
  pairRow([["首发素材数", Number(ad.firstLaunchAssets) || 0, 4], ["素材池总量", Number(ad.totalAssets) || 0, 4], ["拆分规则", ad.splitRule || ""], ["迭代指标", ad.iterationMetrics || ""], ["汇报指标", ad.reportingMetrics || ""]]);

  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ["docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>OpenAdOps</Application></Properties>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(project.name || "未命名项目")} · 搭建策略</dc:title><dc:creator>OpenAdOps</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="搭建策略" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", worksheetXml(rows, merges, [10, 24, 13, 15, 13, 16, 14, 18, 16, 28, 10])]
  ];
  return zip(files);
}

export function strategyWorkbookDownload(project, strategy, options = {}) {
  return {
    bytes: buildStrategyWorkbook(project, strategy, options),
    mime: XLSX_MIME,
    fileName: `${safeFileName(project.name)}-搭建策略.xlsx`
  };
}
