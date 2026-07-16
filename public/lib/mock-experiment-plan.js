import {
  canonicalExperimentPlatform,
  enrichExperimentPlan,
  experimentMetricContext
} from "./experiments.js";

function text(value) {
  return String(value || "").trim();
}

function platformMethod(platform) {
  const canonical = canonicalExperimentPlatform(platform);
  if (canonical === "google") {
    return {
      testType: "Google Ads App asset experiment",
      confidence: 95,
      setup: [
        "在 Google Ads Experiments 中选择 App asset experiment，不用手工复制 Campaign 冒充随机实验。",
        "Control 保持当前资产组合，Variant 只替换本次定义的单一素材变量。",
        "冻结优化事件、市场、预算逻辑和其他资产，记录实验开始与结束日期。"
      ]
    };
  }
  if (canonical === "meta") {
    return {
      testType: "Meta Ads Manager A/B test",
      confidence: 95,
      setup: [
        "在 Ads Manager 发布流程中开启 A/B test，使用平台分流而不是手工复制 Ad Set。",
        "Control 与 Variant 保持相同受众、预算、版位和优化事件，只改变本次素材变量。",
        "开始前保存 Campaign、Ad Set、Ad 名称与素材版本证据。"
      ]
    };
  }
  if (canonical === "tiktok") {
    return {
      testType: "TikTok Ads Manager Split Testing",
      confidence: 90,
      setup: [
        "在 TikTok Ads Manager 创建 Split Test，确保两个组互斥曝光。",
        "Control 与 Variant 使用相同受众、预算、版位和优化事件，只测试一个变量。",
        "优先测试前 2–3 秒 Hook，并保存广告审核与实验状态截图。"
      ]
    };
  }
  return {
    testType: "Platform-native controlled experiment",
    confidence: 95,
    setup: [
      "优先使用媒体后台提供的原生实验能力，并保存随机分流与实验状态证据。",
      "如果媒体不支持原生实验，不把手工复制广告组描述成随机实验。",
      "Control 与 Variant 保持预算、受众、版位、优化事件和其他素材变量一致。"
    ]
  };
}

function metricContext(project, platform, metricName) {
  return experimentMetricContext(project.data?.metrics, platform, metricName);
}

function sourceBriefs(project, launchPack) {
  const launchBriefs = launchPack?.creative_briefs || [];
  if (launchBriefs.length) {
    return launchBriefs.map((item) => ({
      sourceId: item.id,
      platform: item.platform,
      hypothesis: item.hypothesis,
      angle: item.angle,
      hook: item.hook,
      variable: item.test_variable,
      metric: item.success_metric
    }));
  }
  const creativePlan = project.creativePlan || [];
  return creativePlan.map((item, index) => ({
    sourceId: `creative-${index + 1}`,
    platform: item.platform,
    hypothesis: `如果改变“${item.variable}”，${item.metric} 将出现可判断变化。`,
    angle: item.angle,
    hook: item.hook,
    variable: item.variable,
    metric: item.metric
  }));
}

export function buildMockExperimentPlan(project = {}, launchPack = null) {
  const briefs = sourceBriefs(project, launchPack).slice(0, 4);
  const fallbackPlatform = project.platforms?.[0] || "Google Ads";
  const candidates = briefs.length
    ? briefs
    : [{
        sourceId: "operator-draft",
        platform: fallbackPlatform,
        hypothesis: "如果用更直接的结果证明替代泛功能描述，深层事件转化率会提升。",
        angle: "结果证明",
        hook: "先展示结果，再解释过程",
        variable: "首帧信息",
        metric: "MMP 深层事件转化率"
      }];

  const experiments = candidates.map((brief, index) => {
    const method = platformMethod(brief.platform);
    const primaryMetric = text(brief.metric) || "待定义主指标";
    const metric = metricContext(project, brief.platform, primaryMetric);
    return {
      id: `experiment-${index + 1}`,
      name: `${brief.platform} · ${brief.angle} · Test ${String(index + 1).padStart(2, "0")}`,
      platform: brief.platform,
      source: launchPack ? "launch_pack" : "operator",
      priority: index === 0 ? "now" : index === 1 ? "next" : "later",
      status: "draft",
      category: "creative",
      hypothesis: {
        change: `将 Control 的现有开场替换为“${brief.hook}”，其他变量保持一致`,
        metric: primaryMetric,
        direction: "increase",
        expected_lift_percent: null,
        because: text(brief.hypothesis) || `当前素材 Brief 将“${brief.variable}”列为首要不确定性。`
      },
      design: {
        test_type: method.testType,
        control: "当前已批准的基准素材 / 资产组合",
        variant: `${brief.angle}：${brief.hook}`,
        single_variable: brief.variable,
        primary_metric: primaryMetric,
        metric_type: metric.metricType,
        guardrail_metrics: ["花费与审核状态", "安装后质量或业务后台事件"],
        control_percent: 50,
        variant_percent: 50,
        baseline_rate_percent: metric.baseline,
        mde_percent: 20,
        daily_eligible_units: metric.dailyUnits,
        confidence_percent: method.confidence,
        power_percent: 80,
        minimum_days: 7,
        maximum_days: 28
      },
      feasibility: {
        required_sample_per_variant: null,
        estimated_duration_days: null,
        status: "not_calculable",
        rationale: "等待确定性计算。"
      },
      setup_steps: method.setup,
      stop_conditions: [
        "追踪、归因、审核、市场或合规出现异常时立即停止并排查。",
        "除明确的护栏指标恶化外，不在最短 7 天或样本门槛前提前宣布胜负。",
        "实验进行中不同时修改预算、出价、受众和其他素材变量。"
      ],
      decision_rules: {
        win: "达到预设置信度和样本门槛，主指标改善不低于 MDE，且护栏指标没有业务上不可接受的恶化。",
        lose: "达到样本门槛后主指标劣于 Control，或护栏指标触发预先定义的止损条件。",
        inconclusive: "周期结束仍未达到样本门槛，或提升小于 MDE；记录为无结论，不包装成胜负。"
      },
      owner: "投放 + 素材",
      result: {
        outcome: "pending",
        control_value: null,
        variant_value: null,
        relative_change_percent: null,
        confidence_percent: null,
        started_at: "",
        ended_at: "",
        learning: "",
        next_action: "",
        evidence: ""
      }
    };
  });

  return enrichExperimentPlan({
    schema_version: "1.0",
    title: `${project.name || "未命名项目"} · Experiment Ledger`,
    executive_summary: `【Mock 演示】已从当前 Launch Pack / 素材计划生成 ${experiments.length} 个单变量实验。样本和周期由代码计算；流量不足时会明确显示“暂不可判断”。`,
    learning_agenda: [
      "先验证高影响的素材概念和 Hook，再测试受众、出价或结构微调。",
      "每个实验在上线前冻结主指标、MDE、最短周期、护栏指标和止损条件。",
      "没有达到样本门槛的结果记录为 inconclusive，不进入团队 Playbook。"
    ],
    experiments,
    risks: [
      "平台流量分配不等于实际展示或花费完全相等，应以原生实验工具的分流和结果为准。",
      "跨媒体实验不可直接互相比较胜负；归因窗口、市场、事件和时间范围必须一致。",
      "OpenAdOps 只规划和记录实验，不代替媒体后台执行、统计报告或项目负责人批准。"
    ]
  });
}
