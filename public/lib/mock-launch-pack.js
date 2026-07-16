function text(value) {
  return String(value || "").trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function marketCode(markets) {
  return text(markets).split(/[,，/]/)[0]?.trim().toUpperCase() || "GEO";
}

function platformCode(platform) {
  return ({ "Google Ads": "GG", "Meta Ads": "META", "TikTok Ads": "TT" })[platform] || platform.replace(/\W+/g, "").slice(0, 6).toUpperCase();
}

function briefField(intakeResult, key) {
  return intakeResult?.brief_fields?.find((field) => field.key === key) || null;
}

function confirmedBrief(intakeResult, key) {
  return briefField(intakeResult, key)?.status === "confirmed";
}

function normalizedAllocation(project) {
  const platforms = Array.isArray(project.platforms) && project.platforms.length ? project.platforms : ["Google Ads"];
  const budget = Number(project.budget) || 0;
  if (budget <= 0) return Object.fromEntries(platforms.map((platform) => [platform, null]));

  const maxActive = budget < 3000 && platforms.length > 2 ? 2 : platforms.length;
  const preferred = platforms.filter((platform) => Number(project.strategy?.budgetShares?.[platform]) > 0);
  const active = (preferred.length ? preferred : platforms).slice(0, maxActive);
  const raw = active.map((platform) => Math.max(0, Number(project.strategy?.budgetShares?.[platform]) || 0));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const base = total > 0 ? raw.map((value) => round((value / total) * 100, 1)) : active.map(() => round(100 / active.length, 1));
  const difference = round(100 - base.reduce((sum, value) => sum + value, 0), 1);
  base[base.length - 1] = round(base[base.length - 1] + difference, 1);
  return Object.fromEntries(platforms.map((platform) => [platform, active.includes(platform) ? base[active.indexOf(platform)] : 0]));
}

function platformConfig(platform, project) {
  const goal = text(project.goal || "Install");
  const industry = text(project.industry || "移动应用");
  if (platform === "Google Ads") {
    return {
      role: "稳定获量与深层事件基线",
      objective: goal,
      campaignType: goal === "Install" ? "App Campaign · Install volume" : "App Campaign · In-app action",
      bidding: goal === "Install" ? "Maximize Conversions（Install）" : `先 Maximize Conversions（${goal}）；事件量稳定后评估 tCPA`,
      adGroups: ["按市场和优化事件拆分 Campaign", "资产组覆盖功能证明、真实演示和用户场景", "安装与深层事件 Campaign 不混用"],
      audiences: ["App Campaign 由系统自动扩量，主要控制市场、语言、事件与素材", "排除不符合业务范围的国家和已知无效流量"],
      format: "9:16 / 1:1 视频 + 横竖版图片 + 文案资产",
      production: ["提供多长度视频与不同画幅", "广告承诺与商店页首屏保持一致", "每个资产概念使用可辨认命名"]
    };
  }
  if (platform === "Meta Ads") {
    return {
      role: industry === "游戏" ? "玩法与题材概念扩量" : "差异化概念与人群信号扩量",
      objective: goal,
      campaignType: "Advantage+ App Campaign / App promotion",
      bidding: goal === "Install" ? "Lowest Cost（Install）" : `Lowest Cost（${goal}）；稳定后再评估 Cost Cap`,
      adGroups: ["按市场拆分，避免同时过度拆分兴趣和素材", "以差异化素材概念作为主要测试单元", "再营销与新客获量分开记录"],
      audiences: ["优先 Broad 与高价值事件种子，素材承担主要筛选作用", "排除现有用户；金融信用类业务需遵守特殊广告类别限制"],
      format: "9:16 Reels + 1:1 Feed，15–30 秒",
      production: ["首帧在静音状态下可读", "同一假设只改变一个 Hook 或呈现方式", "保留原始素材与平台裁切版本"]
    };
  }
  return {
    role: "原生短视频与新受众验证",
    objective: goal,
    campaignType: "Smart+ App Campaign / App promotion",
    bidding: goal === "Install" ? "Maximum Delivery（Install）" : `Maximum Delivery（${goal}）；达到稳定事件量后评估 Cost Cap`,
    adGroups: ["按市场与核心素材角度建立测试单元", "主体内容保持一致，优先单测前 3 秒 Hook", "Spark 与非 Spark 素材分开记录"],
    audiences: ["优先 Broad，让原生内容完成兴趣匹配", "排除已有用户并验证年龄、地区和商店可用性"],
    format: "9:16 原生短视频，15–30 秒",
    production: ["前 3 秒展示冲突、结果或玩法爽点", "使用平台原生字幕和节奏", "检查安全区、音乐与商业使用权"]
  };
}
function creativeAngles(industry) {
  if (industry === "金融") {
    return [
      ["信任证明", "如果先证明资质、流程透明度和隐私保护，合格注册率会高于泛收益承诺。", "先看清流程与费用，再决定是否注册", "信任信息顺序"],
      ["问题教育", "如果先解释用户真实金融问题，再展示产品路径，用户质量会高于直接促销。", "这一步为什么总是让人放弃？", "教育型 Hook"],
      ["真实流程", "如果展示从进入到核心事件的真实步骤，点击后的落差会降低。", "完整走一遍注册流程，只看需要几步", "流程演示节奏"]
    ];
  }
  if (industry === "游戏") {
    return [
      ["核心玩法", "如果首 3 秒直接展示核心循环，安装意愿会高于世界观铺垫。", "开局 10 秒，能不能逆转？", "首 3 秒玩法爽点"],
      ["题材角色", "相同玩法使用不同角色和世界观，可以识别真正驱动点击的题材。", "换一个阵营，这局完全不同", "角色与题材"],
      ["失败反转", "从失败情境切入并快速展示解法，可以提高完整观看和安装。", "大多数人第一步就选错了", "失败情境"]
    ];
  }
  return [
    ["结果前置", "如果首帧展示使用前后差异，用户会更快理解产品价值。", "先看结果：几秒完成前后对比", "首帧结果"],
    ["痛点反转", "如果先呈现高频失败场景，再展示一键解决，点击意愿会提升。", "还在手动处理这个问题？", "开场痛点"],
    ["真实录屏", "如果用真实操作录屏证明核心路径，商店页后的转化质量会更稳定。", "不剪辑，完整演示一次", "演示节奏"]
  ];
}

function primaryMetric(project) {
  const goal = text(project.goal || "Install");
  if (goal === "Install") return "媒体 CPI + MMP 安装后事件率";
  if (goal === "ROAS" || goal === "Purchase") return "MMP / 业务后台收入与 ROAS";
  return `MMP ${goal} CPA 与转化率`;
}

function checklist(project, intakeResult, activePlatforms) {
  const industry = text(project.industry);
  const budgetKnown = Number(project.budget) > 0;
  const marketKnown = Boolean(text(project.markets));
  const attributionKnown = Boolean(text(project.attribution));
  const creativeKnown = confirmedBrief(intakeResult, "creative_supply") || Boolean(project.creativePlan?.length);
  const complianceKnown = confirmedBrief(intakeResult, "compliance");
  const timelineKnown = confirmedBrief(intakeResult, "timeline");
  const items = [
    { id: "strategy-market", category: "strategy", item: "市场、语言与商店可用范围已冻结", status: marketKnown ? "ready" : "blocker", owner: "项目负责人", evidence: marketKnown ? text(project.markets) : "需要客户确认正式投放国家与语言" },
    { id: "strategy-budget", category: "strategy", item: "总预算与媒体上限已批准", status: budgetKnown ? "ready" : "blocker", owner: "客户 / 项目负责人", evidence: budgetKnown ? `${project.currency || "USD"} ${Number(project.budget).toLocaleString("en-US")} / 月` : "预算缺失，不能确定媒体数量与学习可行性" },
    { id: "tracking-events", category: "tracking", item: "MMP、媒体事件与业务事件映射已测试", status: attributionKnown ? "needs_confirmation" : "blocker", owner: "数据 / 投放", evidence: attributionKnown ? `主归因候选：${project.attribution}，仍需测试事件回传` : "归因来源未确认" },
    { id: "campaign-blueprint", category: "campaign", item: "Campaign 命名、目标、出价和预算说明已冻结", status: activePlatforms.length ? "ready" : "blocker", owner: "投放", evidence: activePlatforms.length ? `${activePlatforms.length} 个媒体进入首轮搭建` : "没有可执行媒体" },
    { id: "creative-supply", category: "creative", item: "首批素材数量、格式、语言和交付日期已确认", status: creativeKnown ? "ready" : "needs_confirmation", owner: "素材 / 客户", evidence: creativeKnown ? "已存在客户素材说明或项目素材计划" : "素材产能未确认" },
    { id: "operations-timeline", category: "operations", item: "上线时间、审核缓冲和首周值班人已确认", status: timelineKnown ? "ready" : "needs_confirmation", owner: "项目负责人", evidence: timelineKnown ? briefField(intakeResult, "timeline")?.value || "已确认" : "上线时间与负责人待确认" }
  ];
  if (industry === "金融") {
    items.push({ id: "compliance-finance", category: "compliance", item: "牌照、当地政策、免责声明和平台限制已由合规负责人批准", status: complianceKnown ? "needs_confirmation" : "blocker", owner: "客户合规 / 法务", evidence: complianceKnown ? "客户已提供合规信息，仍需形成书面批准证据" : "受监管业务缺少可执行合规结论，不得直接上线" });
    if (project.platforms?.includes("Meta Ads")) items.push({ id: "compliance-meta-category", category: "compliance", item: "Meta 金融 / 信用特殊广告类别适用性已确认", status: "blocker", owner: "投放 + 客户合规", evidence: "需要依据具体金融产品和市场政策确认，不由 AI 代替合规判断" });
  } else {
    items.push({ id: "compliance-policy", category: "compliance", item: "平台政策、版权、隐私与素材声明已检查", status: complianceKnown ? "ready" : "needs_confirmation", owner: "投放 / 素材", evidence: complianceKnown ? "客户资料已提供限制" : "上线前需完成平台政策检查" });
  }
  return items;
}

export function buildMockLaunchPack(project = {}, intakeResult = null) {
  const platforms = Array.isArray(project.platforms) && project.platforms.length ? project.platforms : ["Google Ads"];
  const allocation = normalizedAllocation(project);
  const budget = Number(project.budget) || 0;
  const activePlatforms = budget > 0 ? platforms.filter((platform) => Number(allocation[platform]) > 0) : platforms.slice(0, Math.min(platforms.length, 2));
  const industry = text(project.industry || "移动应用");
  const currency = text(project.currency || "USD");
  const market = marketCode(project.markets);
  const goal = text(project.goal || "Install");
  const mediaPlan = platforms.map((platform) => {
    const config = platformConfig(platform, project);
    const percent = allocation[platform];
    const amount = percent === null ? null : round((budget * percent) / 100, 2);
    const active = activePlatforms.includes(platform);
    return {
      platform,
      role: active ? config.role : "候选媒体 / 暂缓",
      objective: config.objective,
      campaign_type: active ? config.campaignType : "本轮不建 Campaign",
      allocation_percent: percent,
      budget_amount: amount,
      currency,
      rationale: active ? `结合 ${industry}、${project.markets || "待确认市场"}、${goal} 目标和当前预算，保留为首轮可判断媒体。` : "当前预算不足以同时支持所有媒体学习，本轮保留为后续扩展候选。",
      prerequisites: ["确认市场与商店可用性", "确认优化事件可回传", ...(platform === "TikTok Ads" ? ["确认持续原生短视频产能"] : [])]
    };
  });

  const campaigns = activePlatforms.map((platform, index) => {
    const config = platformConfig(platform, project);
    const percent = allocation[platform];
    const amount = percent === null ? null : round((budget * percent) / 100, 2);
    return {
      id: `campaign-${index + 1}`,
      platform,
      campaign_name: `${platformCode(platform)}_${market}_${goal.replace(/\s+/g, "")}_PROS_T01`,
      objective: goal,
      optimization_event: goal,
      geo: text(project.markets || "待客户确认"),
      bidding: config.bidding,
      budget_note: amount === null ? "预算未确认：先保留结构，不写入虚假金额" : `${currency} ${amount.toLocaleString("en-US")} / 月，约 ${currency} ${round(amount / 30, 2).toLocaleString("en-US")} / 日`,
      ad_group_logic: config.adGroups,
      audience_notes: config.audiences
    };
  });

  const angles = creativeAngles(industry);
  const creativeBriefs = activePlatforms.flatMap((platform, platformIndex) => {
    const config = platformConfig(platform, project);
    const angle = angles[platformIndex % angles.length];
    return [{
      id: `creative-${platformIndex + 1}`,
      platform,
      hypothesis: angle[1],
      angle: angle[0],
      hook: angle[2],
      format: config.format,
      variants: 3,
      test_variable: angle[3],
      success_metric: primaryMetric(project),
      production_notes: config.production,
      compliance_notes: industry === "金融" ? ["不得承诺保证收益或确定结果", "资质、费用、利率与免责声明必须由客户合规确认", "保存最终审核版本和批准人"] : ["不得使用无授权音乐、人物或素材", "广告承诺必须与商店页和真实产品一致"]
    }];
  });

  const launchChecklist = checklist(project, intakeResult, activePlatforms);
  const blockers = launchChecklist.filter((item) => item.status === "blocker").map((item) => item.item);
  const readyCount = launchChecklist.filter((item) => item.status === "ready").length;
  const score = Math.round((readyCount / launchChecklist.length) * 100);
  const questions = (intakeResult?.clarification_questions || []).map((item) => item.question);
  if (!budget && !questions.some((item) => /预算/.test(item))) questions.unshift("本次测试的月预算、币种和各市场上限是多少？");
  if (!confirmedBrief(intakeResult, "creative_supply") && !questions.some((item) => /素材/.test(item))) questions.push("首批素材数量、格式、语言和每周更新频率是多少？");
  if (industry === "金融" && !questions.some((item) => /合规|牌照|免责声明/.test(item))) questions.push("牌照、当地政策、免责声明和平台特殊广告类别由谁确认？");

  return {
    schema_version: "1.0",
    title: `${project.name || "未命名项目"} · Launch Pack v0`,
    executive_summary: `【Mock 演示】已将当前 Offer、Strategy v0 和项目设置转化为投前作战包。首轮建议启用 ${activePlatforms.join("、") || "待确认媒体"}；当前就绪度 ${score}%，${blockers.length ? `仍有 ${blockers.length} 个上线阻塞项。` : "没有硬阻塞项，但仍需负责人复核。"}`,
    readiness: { score, status: blockers.length ? "blocked" : launchChecklist.some((item) => item.status === "needs_confirmation") ? "conditional" : "ready", blockers },
    assumptions: [
      ...(!budget ? ["预算尚未确认，所有媒体金额保持为空。"] : []),
      ...(!text(project.markets) ? ["正式市场尚未确认，Campaign 中使用待确认占位。"] : []),
      "当前为投前方案，尚未使用上线后的真实表现数据。"
    ],
    media_plan: mediaPlan,
    campaigns,
    creative_briefs: creativeBriefs,
    measurement: {
      source_of_truth: `${project.attribution || "MMP 待确认"} 用于跨媒体归因；业务后台收入、注册或订阅结果作为最终业务口径`,
      primary_event: goal,
      supporting_events: goal === "Install" ? ["Registration / Tutorial complete", "D1 / D7 Retention", "Purchase / Subscription / Revenue"] : ["Install", "上一步漏斗事件", "留存、收入或最终业务结果"],
      platform_feedback: platforms.map((platform) => `${platform} 后台仅用于实时学习状态、审核、花费和投放操作判断，不单独作为业务真相。`),
      attribution_rules: ["媒体与 MMP 指标并列展示，不把平台归因收入直接相加", "上线前冻结点击、展示和再互动窗口", "每次复盘同时记录数据时间范围、时区、币种和事件版本"],
      tracking_checklist: ["MMP SDK / S2S 事件与媒体事件映射已测试", "iOS 与 Android 归因链路分别验证", "Deep Link / Deferred Deep Link 已完成真实设备测试", "测试转化在媒体、MMP 与业务后台均可追踪", "命名和 UTM 参数可以回溯到 Campaign、素材和版本"]
    },
    launch_checklist: launchChecklist,
    first_7_days: [
      { period: "Day 0", actions: ["冻结 Campaign、素材、事件、预算和命名版本", "完成真实设备测试转化并保存截图或日志", "确认审核、上线和值班负责人"], decision_rule: "任何 blocker 未关闭，不进入正式花费。" },
      { period: "Day 1–3", actions: ["检查审核、消耗、学习状态、事件回传和市场异常", "对比媒体安装与 MMP 安装差异", "记录问题但不同时修改预算、出价和素材"], decision_rule: "追踪异常、错误市场或审核问题立即止损；正常学习期不因短期波动频繁改动。" },
      { period: "Day 4–7", actions: ["按媒体、市场、Campaign 和素材角度复盘成本与质量", "形成保留、调整、暂停和补素材清单", "记录下一轮单变量测试假设"], decision_rule: "只有达到预先写明的数据门槛后才做效率结论；无转化且花费超过目标 CPA 3 倍时暂停并排查。" }
    ],
    open_questions: questions.slice(0, 10),
    risks: [
      ...(!budget ? ["预算缺失会影响媒体数量、学习期和测试周期判断。"] : []),
      ...(!confirmedBrief(intakeResult, "creative_supply") ? ["素材供给未确认，Meta / TikTok 可能无法持续测试。"] : []),
      ...(industry === "金融" ? ["金融业务的平台政策与当地监管适用性必须由客户合规或法务确认。"] : []),
      "AI 输出是工作草案，必须由项目负责人确认后才能成为正式执行条件。"
    ]
  };
}
