export const FIELD_LABELS = {
  date: "日期",
  platform: "媒体",
  country: "国家/地区",
  campaign: "Campaign",
  ad_group: "Ad group / Ad set",
  creative: "素材",
  spend: "花费",
  impressions: "展示",
  clicks: "点击",
  installs: "媒体安装",
  af_installs: "AF 安装",
  conversions: "目标转化",
  revenue: "收入",
  d1_retained: "D1 留存人数"
};

export const FIELD_ALIASES = {
  date: ["date", "day", "日期", "时间"],
  platform: ["platform", "media", "channel", "媒体", "渠道"],
  country: ["country", "geo", "market", "国家", "地区", "国家地区"],
  campaign: ["campaign", "campaignname", "广告系列", "广告系列名称"],
  ad_group: ["adgroup", "adset", "adgroupname", "adsetname", "广告组", "广告组名称"],
  creative: ["creative", "ad", "adname", "asset", "素材", "广告名称"],
  spend: ["spend", "cost", "amountspent", "花费", "消耗", "费用"],
  impressions: ["impressions", "impression", "展示", "曝光"],
  clicks: ["clicks", "click", "点击"],
  installs: ["installs", "install", "media installs", "媒体安装", "安装"],
  af_installs: ["afinstalls", "appsflyerinstalls", "afinstall", "af安装", "af 安装"],
  conversions: ["conversions", "conversion", "events", "actions", "目标转化", "转化"],
  revenue: ["revenue", "purchasevalue", "value", "收入", "营收"],
  d1_retained: ["d1retained", "day1retained", "d1users", "d1留存人数", "次留人数"]
};

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()（）]+/g, "");
}

export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const matrix = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) matrix.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell !== "")) matrix.push(row);
  }

  if (matrix.length < 2) throw new Error("CSV 至少需要表头和一行数据");
  const headers = matrix[0].map((header, index) => header || `column_${index + 1}`);
  const rows = matrix.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
  return { headers, rows };
}

export function detectMapping(headers) {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  return Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => {
      const candidates = aliases.map(normalizeHeader);
      const exact = normalized.find((item) => candidates.includes(item.normalized));
      const fuzzy = normalized.find((item) =>
        candidates.some((candidate) => candidate.length > 3 && item.normalized.includes(candidate))
      );
      return [field, exact?.header || fuzzy?.header || ""];
    })
  );
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .trim()
    .replace(/[￥$€£¥,\s]/g, "")
    .replace(/%$/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapRows(rows, mapping) {
  const numericFields = new Set([
    "spend",
    "impressions",
    "clicks",
    "installs",
    "af_installs",
    "conversions",
    "revenue",
    "d1_retained"
  ]);
  return rows.map((row) => {
    const output = {};
    for (const field of Object.keys(FIELD_LABELS)) {
      const source = mapping[field];
      output[field] = numericFields.has(field) ? numberValue(row[source]) : String(row[source] ?? "").trim();
    }
    return output;
  });
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function aggregate(rows) {
  const raw = rows.reduce(
    (accumulator, row) => {
      for (const key of ["spend", "impressions", "clicks", "installs", "af_installs", "conversions", "revenue", "d1_retained"]) {
        accumulator[key] += numberValue(row[key]);
      }
      return accumulator;
    },
    { spend: 0, impressions: 0, clicks: 0, installs: 0, af_installs: 0, conversions: 0, revenue: 0, d1_retained: 0 }
  );
  const attributionInstalls = raw.af_installs || raw.installs;
  return {
    ...raw,
    ctr: safeDivide(raw.clicks, raw.impressions),
    cvr: safeDivide(attributionInstalls, raw.clicks),
    cpi: safeDivide(raw.spend, raw.installs),
    afCpi: safeDivide(raw.spend, raw.af_installs),
    cpa: safeDivide(raw.spend, raw.conversions),
    roas: safeDivide(raw.revenue, raw.spend),
    d1Retention: safeDivide(raw.d1_retained, attributionInstalls)
  };
}

function periodForRows(rows) {
  const dates = [...new Set(rows.map((row) => {
    const raw = String(row.date || "").trim();
    const match = raw.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    return raw.split(/[T\s]/, 1)[0];
  }).filter(Boolean))].sort();
  return {
    startDate: dates[0] || "",
    endDate: dates.at(-1) || "",
    activeDays: dates.length
  };
}

function groupBy(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = row[field] || "未标记";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([name, groupRows]) => ({ name, ...aggregate(groupRows), period: periodForRows(groupRows) }))
    .sort((left, right) => right.spend - left.spend);
}

export function calculateMetrics(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("没有可计算的数据行");
  return {
    rowCount: rows.length,
    summary: aggregate(rows),
    period: periodForRows(rows),
    byPlatform: groupBy(rows, "platform"),
    byCountry: groupBy(rows, "country"),
    byCampaign: groupBy(rows, "campaign")
  };
}

export function formatMetric(value, type = "number", currency = "USD") {
  const number = Number(value) || 0;
  if (type === "percent") return `${(number * 100).toFixed(2)}%`;
  if (type === "ratio") return `${number.toFixed(2)}x`;
  if (type === "currency") {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(number);
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(number);
}
