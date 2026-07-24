function currency(value, code = "USD") {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

export function buildMockAnalysis(project = {}, metrics = {}) {
  const summary = metrics.summary || {};
  const platforms = metrics.byPlatform || [];
  const countries = metrics.byCountry || [];
  const weakestPlatform = [...platforms]
    .filter((item) => item.spend > 0 && Number.isFinite(item.afCpi))
    .sort((a, b) => b.afCpi - a.afCpi)[0];
  const strongestCountry = [...countries].filter((item) => item.af_installs > 0).sort((a, b) => a.afCpi - b.afCpi)[0];
  const platformText = project.platforms?.join("、") || "Google Ads、Meta Ads、TikTok Ads";
  const currencyCode = project.currency || "USD";

  return {
    executive_summary: `【演示】${project.name || "当前项目"}已覆盖 ${platformText}。当前样例数据花费 ${currency(summary.spend, currencyCode)}，AF-CPI ${currency(summary.afCpi, currencyCode)}，D1 留存 ${percent(summary.d1Retention)}。建议先处理高成本单元，再以单变量素材测试验证增长假设。`,
    findings: [
      {
        title: weakestPlatform ? `${weakestPlatform.name} 成本优先排查` : "数据量不足，先完成基础验证",
        evidence: weakestPlatform
          ? `${weakestPlatform.name} 花费 ${currency(weakestPlatform.spend, currencyCode)}，AF-CPI ${currency(weakestPlatform.afCpi, currencyCode)}。`
          : "当前未形成可比较的媒体拆分数据。",
        diagnosis: weakestPlatform ? "该媒体的转化成本高于其他已导入媒体，可能来自素材匹配、国家结构或学习期预算分散。" : "缺少媒体、国家与 AF 安装的完整字段，暂不能定位成本来源。",
        action: weakestPlatform ? "按国家与 Campaign 下钻，暂停高于目标 1.3 倍且已获得足够点击的单元；保留预算用于新素材验证。" : "补齐媒体、国家、花费、点击与 AF 安装字段后再运行正式分析。",
        priority: "high",
        confidence: weakestPlatform ? "medium" : "low",
        validation: "观察后续 3 天 AF-CPI、安装量与 D1 留存是否同时改善。"
      },
      {
        title: strongestCountry ? `${strongestCountry.name} 可作为增量测试市场` : "建立国家层级基线",
        evidence: strongestCountry
          ? `${strongestCountry.name} 当前 AF-CPI 为 ${currency(strongestCountry.afCpi, currencyCode)}，样例中相对更优。`
          : "当前没有可比较的国家维度。",
        diagnosis: strongestCountry ? "成本信号较好，但仍需结合量级和留存确认质量。" : "没有国家层级基线会让预算调整缺少证据。",
        action: strongestCountry ? "仅增加 20% 测试预算，并固定素材与出价，验证增量是否稳定。" : "至少保留 3 个国家的独立 Campaign 或可拆分报表。",
        priority: "medium",
        confidence: "medium",
        validation: "增量预算连续 3 天不推高 AF-CPI，且 D1 留存不低于项目均值。"
      }
    ],
    creative_tests: (project.platforms?.length ? project.platforms : ["Google Ads", "Meta Ads", "TikTok Ads"]).slice(0, 3).map((platform, index) => ({
      angle: ["结果前置", "痛点反转", "场景演示"][index] || "功能证明",
      hook: ["3 秒展示使用前后差异", "先呈现失败场景，再一键解决", "用真实操作录屏证明核心功能"][index] || "突出核心卖点",
      platform,
      variable: "仅更换前 3 秒 Hook，主体内容和 CTA 保持一致",
      success_metric: index === 0 ? "CTR 提升 15%，AF-CPI 不恶化" : "AF-CPI 下降 10%，D1 留存不低于基线"
    })),
    next_actions: [
      {
        action: "完成高成本 Campaign 下钻并标记保留 / 暂停 / 待测试",
        owner: "优化师",
        timing: "今天",
        success_metric: "100% 高消耗单元有明确动作与依据"
      },
      {
        action: "按单变量原则上线 3 组素材测试",
        owner: "优化师 + 设计",
        timing: "本周",
        success_metric: "每个媒体至少获得 1 组可判定结果"
      },
      {
        action: "复核媒体安装与 AF 安装差异",
        owner: "优化师 + 数据",
        timing: "3 天内",
        success_metric: "归因差异被记录并形成可解释口径"
      }
    ]
  };
}
