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
  conversion_event: "目标转化事件",
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
  conversion_event: ["conversionevent", "conversionaction", "eventname", "inappevent", "目标转化事件", "目标事件", "转化事件", "事件名称"],
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

  if (quoted) throw new Error("CSV 存在未闭合的引号");

  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((cell) => cell !== "")) matrix.push(row);
  }

  if (matrix.length < 2) throw new Error("CSV 至少需要表头和一行数据");
  const headers = matrix[0].map((header, index) => header || `column_${index + 1}`);
  const seenHeaders = new Map();
  const duplicateHeaders = new Set();
  for (const header of headers) {
    const identity = normalizeHeader(header);
    if (seenHeaders.has(identity)) {
      duplicateHeaders.add(seenHeaders.get(identity));
      duplicateHeaders.add(header);
    } else {
      seenHeaders.set(identity, header);
    }
  }
  if (duplicateHeaders.size) {
    throw new Error(`CSV 表头重复：${[...duplicateHeaders].join(" / ")}`);
  }
  const rows = matrix.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
  return { headers, rows };
}

function isAppsFlyerInstallHeader(normalizedHeader) {
  return (
    normalizedHeader.includes("afinstall")
    || normalizedHeader.includes("appsflyerinstall")
    || normalizedHeader.includes("af安装")
    || (normalizedHeader.includes("appsflyer") && (normalizedHeader.includes("install") || normalizedHeader.includes("安装")))
    || (/^af/.test(normalizedHeader) && (normalizedHeader.includes("install") || normalizedHeader.includes("安装")))
  );
}

function matchHeader(field, item, candidates) {
  const exact = candidates.includes(item.normalized);
  if (exact) {
    if (field === "installs" && isAppsFlyerInstallHeader(item.normalized)) return false;
    return true;
  }
  const fuzzy = candidates.some((candidate) => candidate.length > 3 && item.normalized.includes(candidate));
  if (!fuzzy) return false;
  // "AF Installs" contains "installs" — do not bind it to media installs.
  if (field === "installs" && isAppsFlyerInstallHeader(item.normalized)) return false;
  // Media-only install headers should not satisfy af_installs via weak substrings.
  if (field === "af_installs" && !isAppsFlyerInstallHeader(item.normalized) && !candidates.includes(item.normalized)) {
    return false;
  }
  return true;
}

export function detectMapping(headers) {
  const normalized = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  const claimed = new Set();
  // Resolve AF installs before media installs so shared substrings cannot collide.
  const fieldOrder = [
    "af_installs",
    "installs",
    ...Object.keys(FIELD_ALIASES).filter((field) => field !== "af_installs" && field !== "installs")
  ];
  const mapping = Object.fromEntries(Object.keys(FIELD_ALIASES).map((field) => [field, ""]));

  for (const field of fieldOrder) {
    const candidates = FIELD_ALIASES[field].map(normalizeHeader);
    const available = normalized.filter((item) => !claimed.has(item.header));
    const exact = available.find((item) => candidates.includes(item.normalized) && matchHeader(field, item, candidates));
    const fuzzy = available.find(
      (item) => !candidates.includes(item.normalized) && matchHeader(field, item, candidates)
    );
    const match = exact || fuzzy;
    if (match) {
      mapping[field] = match.header;
      claimed.add(match.header);
    }
  }
  return mapping;
}

const NUMERIC_FIELDS = new Set([
  "spend",
  "impressions",
  "clicks",
  "installs",
  "af_installs",
  "conversions",
  "revenue",
  "d1_retained"
]);

function parseNumericCell(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { value, valid: true, blank: false }
      : { value: 0, valid: false, blank: false };
  }
  const raw = String(value ?? "").trim();
  if (!raw) return { value: 0, valid: true, blank: true };
  const accountingNegative = /^\(([^()]*)\)$/.exec(raw);
  const normalized = String(accountingNegative?.[1] ?? raw)
    .replace(/[￥$€£¥,\s]/g, "")
    .replace(/%$/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? { value: accountingNegative ? -Math.abs(parsed) : parsed, valid: true, blank: false }
    : { value: 0, valid: false, blank: false };
}

function numberValue(value) {
  return parseNumericCell(value).value;
}

export function calculateNumericQuality(rows, mapping) {
  const values = Array.isArray(rows) ? rows : [];
  const fields = [...NUMERIC_FIELDS]
    .filter((field) => mapping?.[field])
    .map((field) => {
      let invalidCells = 0;
      let blankCells = 0;
      for (const row of values) {
        const parsed = parseNumericCell(row?.[mapping[field]]);
        if (!parsed.valid) invalidCells += 1;
        if (parsed.blank) blankCells += 1;
      }
      return { field, invalidCells, blankCells };
    });
  return {
    totalRows: values.length,
    checkedFields: fields.length,
    invalidCells: fields.reduce((sum, field) => sum + field.invalidCells, 0),
    blankCells: fields.reduce((sum, field) => sum + field.blankCells, 0),
    fields
  };
}

export function mapRows(rows, mapping) {
  return rows.map((row) => {
    const output = {};
    for (const field of Object.keys(FIELD_LABELS)) {
      const source = mapping[field];
      output[field] = NUMERIC_FIELDS.has(field) ? numberValue(row[source]) : String(row[source] ?? "").trim();
    }
    return output;
  });
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
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
  const conversionEvents = [...new Set(rows.map((row) => String(row.conversion_event || "").trim()).filter(Boolean))];
  return {
    ...raw,
    conversionEvent: conversionEvents.length === 1 ? conversionEvents[0] : "",
    ctr: safeDivide(raw.clicks, raw.impressions),
    cvr: safeDivide(attributionInstalls, raw.clicks),
    cpi: safeDivide(raw.spend, raw.installs),
    afCpi: safeDivide(raw.spend, raw.af_installs),
    cpa: safeDivide(raw.spend, raw.conversions),
    roas: safeDivide(raw.revenue, raw.spend),
    d1Retention: safeDivide(raw.d1_retained, attributionInstalls)
  };
}

export function normalizeDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return "";
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return "";
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodForRows(rows) {
  const dates = [...new Set(rows.map((row) => normalizeDate(row.date)).filter(Boolean))].sort();
  return {
    startDate: dates[0] || "",
    endDate: dates.at(-1) || "",
    activeDays: dates.length,
    dates
  };
}

export function filterRowsByDate(rows, startDate, endDate) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end || start > end) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const date = normalizeDate(row.date);
    return date && date >= start && date <= end;
  });
}

export function calculateDateQuality(rows) {
  const values = Array.isArray(rows) ? rows : [];
  const validRows = values.filter((row) => Boolean(normalizeDate(row.date))).length;
  return {
    totalRows: values.length,
    validRows,
    invalidRows: values.length - validRows
  };
}

export function defaultComparisonRanges(rows) {
  const dates = periodForRows(Array.isArray(rows) ? rows : []).dates;
  const windowSize = Math.floor(dates.length / 2);
  if (windowSize < 1) return null;
  const currentDates = dates.slice(-windowSize);
  const previousDates = dates.slice(-(windowSize * 2), -windowSize);
  return {
    previousStart: previousDates[0],
    previousEnd: previousDates.at(-1),
    currentStart: currentDates[0],
    currentEnd: currentDates.at(-1)
  };
}

const COMPARISON_METRICS = {
  spend: { fields: ["spend"], preference: "neutral" },
  installs: { fields: ["installs"], preference: "neutral" },
  af_installs: { fields: ["af_installs"], preference: "neutral" },
  cpi: { fields: ["spend", "installs"], preference: "lower" },
  afCpi: { fields: ["spend", "af_installs"], preference: "lower" },
  conversions: { fields: ["conversions"], preference: "neutral" },
  cpa: { fields: ["spend", "conversions"], preference: "lower" },
  roas: { fields: ["spend", "revenue"], preference: "higher" }
};

function metricChange(current, previous, preference) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return {
      current,
      previous,
      delta: null,
      relativeChange: null,
      trend: "unavailable",
      assessment: "neutral"
    };
  }
  const delta = current - previous;
  const relativeChange = previous === 0 ? null : delta / Math.abs(previous);
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  let assessment = "neutral";
  if (trend !== "flat" && preference !== "neutral") {
    assessment = (preference === "higher" && trend === "up") || (preference === "lower" && trend === "down")
      ? "positive"
      : "negative";
  }
  return { current, previous, delta, relativeChange, trend, assessment };
}

function normalizedRangeValue(value) {
  const normalized = normalizeDate(value);
  if (!normalized) throw new Error("对比区间日期无效");
  return normalized;
}

export function calculatePeriodComparison(rows, ranges, { availableFields = [] } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("没有可对比的数据行");
  const normalizedRanges = {
    previousStart: normalizedRangeValue(ranges?.previousStart),
    previousEnd: normalizedRangeValue(ranges?.previousEnd),
    currentStart: normalizedRangeValue(ranges?.currentStart),
    currentEnd: normalizedRangeValue(ranges?.currentEnd)
  };
  if (normalizedRanges.previousStart > normalizedRanges.previousEnd || normalizedRanges.currentStart > normalizedRanges.currentEnd) {
    throw new Error("对比区间开始日期不能晚于结束日期");
  }
  if (normalizedRanges.previousEnd >= normalizedRanges.currentStart) {
    throw new Error("对比期必须早于本期，且两个区间不能重叠");
  }

  const previousRows = filterRowsByDate(rows, normalizedRanges.previousStart, normalizedRanges.previousEnd);
  const currentRows = filterRowsByDate(rows, normalizedRanges.currentStart, normalizedRanges.currentEnd);
  const fields = new Set(availableFields);
  const previousSummary = aggregate(previousRows);
  const currentSummary = aggregate(currentRows);
  const availableMetrics = Object.entries(COMPARISON_METRICS)
    .filter(([, definition]) => definition.fields.every((field) => fields.has(field)))
    .map(([metric]) => metric);
  const available = previousRows.length > 0 && currentRows.length > 0;
  const changes = available
    ? Object.fromEntries(availableMetrics.map((metric) => [
        metric,
        metricChange(currentSummary[metric], previousSummary[metric], COMPARISON_METRICS[metric].preference)
      ]))
    : {};

  return {
    available,
    reason: available ? "" : "所选区间至少有一段没有数据",
    ranges: normalizedRanges,
    availableMetrics,
    previous: { rowCount: previousRows.length, summary: previousSummary, period: periodForRows(previousRows) },
    current: { rowCount: currentRows.length, summary: currentSummary, period: periodForRows(currentRows) },
    changes
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
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (type === "percent") return `${(number * 100).toFixed(2)}%`;
  if (type === "ratio") return `${number.toFixed(2)}x`;
  if (type === "currency") {
    return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 }).format(number);
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(number);
}
