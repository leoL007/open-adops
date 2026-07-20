import { primaryTargetText } from "./project-targets.js";

export const INTAKE_BRIEF_FIELDS = [
  ["product", "产品 / 需求"],
  ["industry", "行业"],
  ["markets", "市场与语言"],
  ["objective", "投放目标"],
  ["platforms", "媒体范围"],
  ["budget", "预算与币种"],
  ["kpi", "核心 KPI"],
  ["conversion_event", "转化事件"],
  ["timeline", "投放周期"],
  ["audience", "目标用户"],
  ["creative_supply", "素材供给"],
  ["attribution", "归因口径"],
  ["compliance", "合规要求"],
  ["constraints", "其他限制"]
];

const SOURCE_ORDER = [
  ["offer", "rawOffer"],
  ["client_strategy", "clientStrategy"],
  ["operator_notes", "operatorNotes"]
];

function text(value) {
  return String(value || "").trim();
}

function sourceFor(intake, patterns) {
  for (const [source, key] of SOURCE_ORDER) {
    const value = text(intake?.[key]);
    if (value && patterns.some((pattern) => pattern.test(value))) return source;
  }
  return "";
}

function makeField(key, value, source, status = "confirmed", evidence = "") {
  return {
    key,
    value: text(value),
    status: value ? status : "missing",
    source: value ? source : "unknown",
    evidence: value ? text(evidence || "来自当前项目与粘贴资料") : "资料中未找到，需要客户或优化师补充"
  };
}

function inferredField(key, value, evidence) {
  return makeField(key, value, "ai_inference", "inferred", evidence);
}

function detectMarkets(raw, fallback) {
  const pairs = [
    [/\bJP\b|日本|Japan/i, "JP"],
    [/\bUS\b|美国|United States/i, "US"],
    [/\bGB\b|英国|United Kingdom|UK/i, "GB"],
    [/\bID\b|印尼|Indonesia/i, "ID"],
    [/\bTH\b|泰国|Thailand/i, "TH"],
    [/\bTW\b|台湾|Taiwan/i, "TW"],
    [/\bSG\b|新加坡|Singapore/i, "SG"],
    [/\bDE\b|德国|Germany/i, "DE"],
    [/\bFR\b|法国|France/i, "FR"]
  ];
  const hits = pairs.filter(([pattern]) => pattern.test(raw)).map(([, code]) => code);
  return hits.length ? hits.join(", ") : text(fallback);
}

function detectPlatforms(raw, fallback = []) {
  const hits = [];
  if (/google|gg|uac|admob/i.test(raw)) hits.push("Google Ads");
  if (/meta|facebook|instagram|\bfb\b/i.test(raw)) hits.push("Meta Ads");
  if (/tiktok|\btt\b/i.test(raw)) hits.push("TikTok Ads");
  return hits.length ? hits : fallback;
}

function detectIndustry(raw, fallback) {
  if (/金融|贷款|借贷|银行|fintech|finance|credit|wallet/i.test(raw)) return "金融";
  if (/游戏|game|gaming|rpg|slg|休闲/i.test(raw)) return "游戏";
  if (/工具|utility|photo|图片|视频编辑|效率/i.test(raw)) return "工具";
  return text(fallback || "移动应用");
}

function platformRole(platform, industry) {
  if (platform === "Google Ads") return industry === "金融" ? "承接高意图搜索与 App 转化" : "建立稳定获量基线与跨网络覆盖";
  if (platform === "Meta Ads") return industry === "游戏" ? "用题材与玩法概念扩量" : "用人群信号与差异化概念拓量";
  return industry === "工具" ? "用原生场景演示验证年轻用户需求" : "用原生短视频验证新受众与素材方向";
}

function campaignPlan(platform, markets) {
  if (platform === "Google Ads") return `${markets || "市场"} × 优化事件建立 App Campaign，安装与深层事件分开验证`;
  if (platform === "Meta Ads") return `${markets || "市场"} × 素材概念组搭建，避免过度拆分受众导致学习分散`;
  return `${markets || "市场"} × 原生 Hook 组搭建，保持主体内容一致并单测前 3 秒`;
}

function creativePlan(industry) {
  if (industry === "金融") return ["信任与安全证明：资质、流程透明度、隐私保护", "问题教育：先解释金融痛点，再呈现产品解决方案", "真实流程演示：注册、验证、核心事件路径"];
  if (industry === "游戏") return ["玩法爽点：首 3 秒直接展示核心循环", "题材与角色：同一玩法测试不同世界观 Hook", "失败反转：从高压情境切入并展示策略解法"];
  return ["结果前置：首帧展示使用前后差异", "痛点反转：先呈现失败场景，再一键解决", "真实录屏：用 15–30 秒证明核心工作流"];
}

function fieldValue(fields, key) {
  return fields.find((field) => field.key === key)?.value || "";
}

export function buildMockIntake(project = {}, intake = {}, intent = "strategy") {
  const raw = [intake.rawOffer, intake.clientStrategy, intake.operatorNotes].map(text).filter(Boolean).join("\n");
  const industry = detectIndustry(raw, project.industry);
  const markets = detectMarkets(raw, project.markets);
  const detectedPlatforms = detectPlatforms(raw, project.platforms || []);
  const platforms = detectedPlatforms.length ? detectedPlatforms : ["Google Ads"];
  const marketSource = sourceFor(intake, [/市场|国家|地区|market|geo|\bJP\b|\bUS\b|日本|美国/i]);
  const platformSource = sourceFor(intake, [/google|meta|facebook|tiktok|媒体|渠道|platform/i]);
  const budgetSource = sourceFor(intake, [/预算|budget|spend|花费|\bUSD\b|美元|人民币/i]);
  const kpiSource = sourceFor(intake, [/kpi|cpi|cpa|roas|成本|回收/i]);
  const eventSource = sourceFor(intake, [/事件|event|安装|注册|付费|订阅|首充|开户|purchase|install/i]);
  const timelineSource = sourceFor(intake, [/周期|上线|日期|timeline|week|month|天|周|月/i]);
  const audienceSource = sourceFor(intake, [/用户|受众|人群|audience|年龄|兴趣/i]);
  const creativeSource = sourceFor(intake, [/素材|视频|图片|creative|asset|ugc/i]);
  const creativeSupplyUncertain = /(?:素材|视频|图片|creative|asset).{0,16}(?:待确认|未知|未提供|没有|不确定)|(?:待确认|未知|未提供|没有|不确定).{0,16}(?:素材|视频|图片|creative|asset)/i.test(raw);
  const attributionSource = sourceFor(intake, [/归因|appsflyer|adjust|mmp|ga4|attribution/i]);
  const complianceSource = sourceFor(intake, [/合规|资质|牌照|限制|compliance|license|disclaimer/i]);

  const projectBudget = Number(project.budget) > 0 ? `${project.currency || "USD"} ${Number(project.budget).toLocaleString("en-US")} / 月` : "";
  const projectKpi = primaryTargetText(project);
  const audience = text(project.strategy?.audience);
  const constraintText = [intake.strategyAuthority === "mandatory" ? "客户已有策略视为必须执行" : "客户已有策略仅供参考", intake.operatorNotes].filter(Boolean).join("；");

  const fields = [
    makeField("product", project.name || "未命名项目", sourceFor(intake, [/产品|offer|app|应用|项目/i]) || "operator_notes", "confirmed", "项目名称或客户资料"),
    makeField("industry", industry, sourceFor(intake, [/行业|金融|游戏|工具|finance|game|utility/i]) || "operator_notes", "confirmed", "客户描述或项目行业"),
    marketSource ? makeField("markets", markets, marketSource, "confirmed", "客户资料中的市场信息") : inferredField("markets", markets, markets ? "沿用项目设置，需客户确认语言与国家范围" : ""),
    makeField("objective", project.goal || "", sourceFor(intake, [/目标|objective|安装|注册|付费|roas/i]) || (project.goal ? "operator_notes" : "unknown"), project.goal ? "confirmed" : "missing", "客户资料或项目设置"),
    platformSource ? makeField("platforms", platforms.join("、"), platformSource, "confirmed", "客户指定或建议媒体") : inferredField("platforms", platforms.join("、"), platforms.length ? "沿用项目媒体设置，需确认媒体是否为硬性范围" : ""),
    makeField("budget", projectBudget, budgetSource || (projectBudget ? "operator_notes" : "unknown"), projectBudget ? "confirmed" : "missing", budgetSource ? "客户资料提及预算" : "项目设置中的预算"),
    makeField("kpi", projectKpi, kpiSource || (projectKpi ? "operator_notes" : "unknown"), projectKpi ? "confirmed" : "missing", kpiSource ? "客户资料提及 KPI" : "项目设置中的 KPI"),
    makeField("conversion_event", project.goal || "", eventSource || (project.goal ? "operator_notes" : "unknown"), project.goal ? "confirmed" : "missing", "主要优化事件"),
    makeField("timeline", "", timelineSource || "unknown", "missing", ""),
    audienceSource ? makeField("audience", audience || "客户资料已描述目标用户", audienceSource, "confirmed", "客户资料中的用户描述") : inferredField("audience", audience, audience ? "沿用项目策略假设，需客户确认" : ""),
    makeField("creative_supply", creativeSource && !creativeSupplyUncertain ? "客户已提及素材供给，需确认数量、格式与更新频率" : "", creativeSource && !creativeSupplyUncertain ? creativeSource : "unknown", creativeSource && !creativeSupplyUncertain ? "confirmed" : "missing", "素材供给与产能"),
    makeField("attribution", project.attribution || "", attributionSource || (project.attribution ? "operator_notes" : "unknown"), project.attribution ? "confirmed" : "missing", "项目归因设置"),
    makeField("compliance", complianceSource ? "客户资料已提及合规要求，需在上线前形成可执行清单" : "", complianceSource || "unknown", complianceSource ? "confirmed" : "missing", "监管、资质和文案限制"),
    makeField("constraints", constraintText, constraintText ? "operator_notes" : "unknown", constraintText ? "confirmed" : "missing", "客户策略权限与优化师补充")
  ];

  const missingQuestionMap = {
    budget: ["本次测试的月预算、币种以及各市场预算上限是多少？", "没有预算无法判断媒体数量和学习期可行性"],
    kpi: ["首阶段最重要的 KPI 和可接受目标值是什么？", "避免用安装量替代真实业务目标"],
    conversion_event: ["媒体最终应该优化到安装、注册、首充、订阅还是收入事件？", "优化事件决定 Campaign 与出价策略"],
    timeline: ["计划何时上线，测试期和复盘节点分别是什么？", "决定素材、合规和数据准备节奏"],
    audience: ["核心用户是谁？请补充年龄、需求场景、付费动机或高价值用户特征。", "用户定义决定媒体角色、素材角度和优化事件"],
    creative_supply: ["客户每周能提供多少图片、视频或 UGC 素材？", "媒体组合必须匹配真实素材产能"],
    attribution: ["最终以媒体后台、AppsFlyer、Adjust 还是业务后台作为判断口径？", "避免上线后出现归因争议"],
    compliance: ["是否存在国家、牌照、免责声明、禁投人群或素材审核要求？", industry === "金融" ? "金融与受监管业务必须先确认合规边界" : "上线前需要确认平台政策、品牌安全和素材限制"]
  };
  const questionOrder = industry === "金融"
    ? ["budget", "kpi", "conversion_event", "compliance", "timeline", "audience", "creative_supply", "attribution"]
    : ["budget", "kpi", "conversion_event", "timeline", "audience", "creative_supply", "attribution", "compliance"];
  const clarificationQuestions = fields
    .filter((field) => field.status !== "confirmed" && missingQuestionMap[field.key])
    .sort((a, b) => questionOrder.indexOf(a.key) - questionOrder.indexOf(b.key))
    .slice(0, 7)
    .map((field, index) => ({
      field_key: field.key,
      question: missingQuestionMap[field.key][0],
      reason: missingQuestionMap[field.key][1],
      priority: index < 3 || ["budget", "kpi", "conversion_event"].includes(field.key) || (industry === "金融" && field.key === "compliance") ? "required" : "recommended"
    }));

  const assumptions = fields
    .filter((field) => field.status === "inferred")
    .map((field) => `暂定假设：${INTAKE_BRIEF_FIELDS.find(([key]) => key === field.key)?.[1]}为“${field.value}”，需客户确认。`);
  if (!fieldValue(fields, "budget")) assumptions.push("暂定假设：先以单市场、1–2 个主媒体完成可行性测试，不预设固定预算数字。");
  const budgetScenario = fieldValue(fields, "budget")
    ? `以 ${fieldValue(fields, "budget")} 为上限，70% 用于主获量、20% 用于潜力单元、10% 用于实验。`
    : "预算未确认：分别输出小预算验证、标准测试和放量三档，不编造固定金额。";

  return {
    executive_summary: `【演示】已把客户碎片资料整理为 ${fields.length} 个 Brief 字段；当前有 ${fields.filter((field) => field.status === "confirmed").length} 项已确认、${fields.filter((field) => field.status === "inferred").length} 项待确认、${fields.filter((field) => field.status === "missing").length} 项缺失。${intent === "questions" ? "建议先发送追问清单，再冻结策略初稿。" : "可先生成带假设的策略初稿，同时向客户补齐关键信息。"}`,
    brief_fields: fields,
    clarification_questions: clarificationQuestions,
    strategy_draft: {
      positioning: `围绕“${project.name || "当前产品"}”建立可判断的首轮投放基线，先验证 ${fieldValue(fields, "objective") || "核心转化事件"} 与用户质量，再决定扩量。`,
      working_assumptions: assumptions.length ? assumptions : ["当前关键输入已覆盖；上线前仍需由项目负责人复核口径。"],
      platform_plan: platforms.map((platform) => ({
        platform,
        role: platformRole(platform, industry),
        rationale: `结合 ${industry} 行业特征与 ${markets || "目标市场"} 的用户获取链路，先以可判断性为优先。`,
        budget_scenario: budgetScenario
      })),
      campaign_plan: platforms.map((platform) => campaignPlan(platform, markets)),
      creative_plan: creativePlan(industry),
      measurement_plan: [
        `上线前确认 ${fieldValue(fields, "attribution") || "MMP / 业务后台"} 为主口径，媒体数据用于实时优化。`,
        `分别记录安装、${fieldValue(fields, "conversion_event") || "核心事件"} 与收入/留存，避免只看浅层转化。`,
        "首周不同时修改预算、出价和素材；每次测试只改变一个主要变量。"
      ],
      first_week_plan: [
        "Day 0：冻结事件、归因、命名、市场与素材版本。",
        "Day 1–3：检查花费、学习状态、归因差异和异常流量，不做过早结论。",
        "Day 4–7：按媒体与市场复盘成本和质量，形成保留 / 调整 / 停止清单。"
      ],
      risks: [
        ...(!fieldValue(fields, "budget") ? ["预算未确认，当前媒体组合只能作为场景方案。"] : []),
        ...(!fieldValue(fields, "compliance") ? [industry === "金融" ? "合规要求未确认，受监管行业不得直接上线。" : "平台政策与素材限制未确认，上线前需补齐。"] : []),
        ...(!fieldValue(fields, "creative_supply") ? ["素材产能未知，可能无法支持 Meta / TikTok 的持续测试。"] : []),
        "所有 AI 推断必须由优化师或客户确认后才能成为正式执行条件。"
      ]
    }
  };
}
