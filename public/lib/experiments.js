const CONFIDENCE_Z = {
  90: 1.644854,
  95: 1.959964
};

const POWER_Z = {
  80: 0.841621
};

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizedText(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_\-./()（）]+/g, "");
}

export function canonicalExperimentPlatform(value) {
  const compact = normalizedText(value);
  if (compact.includes("googleadwords") || compact.includes("googleads") || compact === "google" || compact === "adwords") return "google";
  if (compact.includes("facebook") || compact.includes("metaads") || compact === "meta") return "meta";
  if (compact.includes("tiktok") || compact.includes("bytedance")) return "tiktok";
  return compact;
}

export function inferExperimentMetric(metricName) {
  const compact = normalizedText(metricName);
  const hasCost = ["cpi", "cpa", "cpc", "cpm"].some((token) => compact.includes(token))
    || compact.includes("成本")
    || compact.includes("单价");
  const hasRevenue = compact.includes("roas")
    || compact.includes("revenue")
    || compact.includes("收入")
    || compact.includes("营收")
    || compact.includes("回收");
  const hasRate = compact.includes("ctr")
    || compact.includes("cvr")
    || compact.includes("rate")
    || compact.includes("率");
  if ([hasCost, hasRevenue, hasRate].filter(Boolean).length > 1) {
    return { metricType: "composite", rate: null, denominator: null };
  }
  if (hasCost) return { metricType: "cost", rate: null, denominator: null };
  if (hasRevenue) return { metricType: "revenue", rate: null, denominator: null };
  if (compact.includes("ctr") || compact.includes("clickthroughrate") || compact.includes("点击率")) {
    return { metricType: "rate", rate: "ctr", denominator: "impressions" };
  }
  if (
    compact.includes("conversionrate")
    || compact.includes("registrationrate")
    || compact.includes("purchaserate")
    || compact.includes("signuprate")
    || compact.includes("注册率")
    || compact.includes("购买率")
    || compact.includes("付费率")
    || compact.includes("转化率")
    || compact.includes("事件率")
    || (
      compact.includes("cvr")
      && ["registration", "signup", "purchase", "conversion", "event", "注册", "购买", "付费", "转化", "事件"]
        .some((token) => compact.includes(token))
    )
  ) {
    return { metricType: "rate", rate: "conversion", denominator: "clicks" };
  }
  if (compact.includes("cvr") || compact.includes("installrate") || compact.includes("安装率")) {
    return { metricType: "rate", rate: "install", denominator: "clicks" };
  }
  if (compact.endsWith("rate") || compact.endsWith("率")) {
    return { metricType: "rate", rate: null, denominator: null };
  }
  return { metricType: "count", rate: null, denominator: null };
}

function canonicalConversionEvent(value) {
  const compact = normalizedText(value);
  if (["registration", "register", "signup", "注册"].some((token) => compact.includes(token))) return "registration";
  if (["purchase", "buyer", "购买", "付费"].some((token) => compact.includes(token))) return "purchase";
  if (["activation", "activate", "激活"].some((token) => compact.includes(token))) return "activation";
  if (["lead", "线索"].some((token) => compact.includes(token))) return "lead";
  return compact;
}

export function experimentMetricContext(metrics = {}, platform, metricName) {
  const platformKey = canonicalExperimentPlatform(platform);
  const platformMetrics = metrics?.byPlatform?.find((item) => canonicalExperimentPlatform(item.name) === platformKey);
  const definition = inferExperimentMetric(metricName);
  if (!platformMetrics || definition.metricType !== "rate" || !definition.rate || !definition.denominator) {
    return { baseline: null, dailyUnits: null, metricType: definition.metricType };
  }

  const period = platformMetrics.period || metrics.period;
  const activeDays = Number(period?.activeDays) || 0;
  const denominator = Number(platformMetrics[definition.denominator]) || 0;
  const declaredConversionEvent = platformMetrics.conversionEvent || metrics.conversionEvent;
  const eventMatched = definition.rate !== "conversion"
    || (
      Boolean(declaredConversionEvent)
      && canonicalConversionEvent(declaredConversionEvent) === canonicalConversionEvent(metricName)
    );
  if (!eventMatched) {
    return { baseline: null, dailyUnits: null, metricType: definition.metricType };
  }
  const rate = definition.rate === "ctr"
    ? Number(platformMetrics.ctr)
    : definition.rate === "install"
      ? Number(platformMetrics.cvr)
      : denominator > 0
        ? Number(platformMetrics.conversions) / denominator
        : 0;
  return {
    baseline: rate > 0 ? rounded(rate * 100, 2) : null,
    dailyUnits: activeDays > 0 && denominator > 0 ? Math.round(denominator / activeDays) : null,
    metricType: definition.metricType
  };
}

export function applyExperimentMetricContext(plan = {}, metrics = {}) {
  return {
    ...plan,
    experiments: Array.isArray(plan.experiments)
      ? plan.experiments.map((experiment) => {
          const context = experimentMetricContext(metrics, experiment.platform, experiment.design?.primary_metric);
          return {
            ...experiment,
            design: {
              ...experiment.design,
              metric_type: context.metricType,
              baseline_rate_percent: context.baseline,
              daily_eligible_units: context.dailyUnits
            }
          };
        })
      : []
  };
}

export function normalizeExperimentDesign(design = {}) {
  const minimumDays = Math.max(1, Math.round(finiteNumber(design.minimum_days) || 7));
  const maximumDays = Math.max(minimumDays, Math.round(finiteNumber(design.maximum_days) || 28));
  return {
    ...design,
    minimum_days: minimumDays,
    maximum_days: maximumDays
  };
}

export function experimentSizingInputError(field, value) {
  if (field === "design.minimum_days") {
    return Number.isInteger(value) && value > 0 ? "" : "最短天数必须是正整数。";
  }
  if (value === null) return "";
  if (field === "design.baseline_rate_percent" && (!(value > 0) || !(value < 100))) {
    return "基准转化率必须大于 0 且小于 100。";
  }
  if (field === "design.mde_percent" && !(value > 0)) return "MDE 必须大于 0。";
  if (field === "design.daily_eligible_units" && !(value > 0)) return "每日可进入样本必须大于 0。";
  return "";
}

export function calculateExperimentFeasibility(design = {}) {
  if (design.metric_type === "composite") {
    return {
      required_sample_per_variant: null,
      estimated_duration_days: null,
      status: "not_calculable",
      rationale: "当前主指标包含多个指标，请先拆成一个主要指标和独立护栏指标后再计算。"
    };
  }
  if (design.metric_type !== "rate") {
    return {
      required_sample_per_variant: null,
      estimated_duration_days: null,
      status: "not_calculable",
      rationale: "当前主指标不是比例指标，请使用媒体原生实验结果或预先定义的业务阈值判断。"
    };
  }

  const baselinePercent = finiteNumber(design.baseline_rate_percent);
  const mdePercent = finiteNumber(design.mde_percent);
  const dailyUnits = finiteNumber(design.daily_eligible_units);
  const controlPercent = finiteNumber(design.control_percent);
  const variantPercent = finiteNumber(design.variant_percent);
  const confidenceZ = CONFIDENCE_Z[design.confidence_percent];
  const powerZ = POWER_Z[design.power_percent];

  const inputsValid = baselinePercent > 0
    && baselinePercent < 100
    && mdePercent > 0
    && dailyUnits > 0
    && controlPercent > 0
    && variantPercent > 0
    && rounded(controlPercent + variantPercent, 4) === 100
    && confidenceZ
    && powerZ;

  if (!inputsValid) {
    return {
      required_sample_per_variant: null,
      estimated_duration_days: null,
      status: "not_calculable",
      rationale: "补充基准转化率、最小可检测提升和每日可进入实验的样本量后，才能计算样本与周期。"
    };
  }

  const baseline = baselinePercent / 100;
  const absoluteDifference = baseline * (mdePercent / 100);
  const numerator = (confidenceZ + powerZ) ** 2 * 2 * baseline * (1 - baseline);
  const samplePerVariant = Math.ceil((numerator / (absoluteDifference ** 2)) - 1e-9);
  const dailyPerVariant = dailyUnits * (Math.min(controlPercent, variantPercent) / 100);
  const calculatedDays = Math.ceil(samplePerVariant / dailyPerVariant);
  const minimumDays = Math.max(1, Math.round(finiteNumber(design.minimum_days) || 7));
  const maximumDays = Math.max(minimumDays, Math.round(finiteNumber(design.maximum_days) || 28));
  const estimatedDays = Math.max(minimumDays, calculatedDays);
  const status = estimatedDays <= maximumDays
    ? "ready"
    : estimatedDays <= 90
      ? "long_horizon"
      : "insufficient_volume";

  const rationale = status === "ready"
    ? `预计每个版本至少需要 ${samplePerVariant.toLocaleString("en-US")} 个样本，约 ${estimatedDays} 天；达到最短周期前不提前宣布胜负。`
    : status === "long_horizon"
      ? `预计需要 ${estimatedDays} 天，超过建议的 ${maximumDays} 天窗口；应提高流量、放宽 MDE 或改用平台原生判断。`
      : `预计需要 ${estimatedDays} 天，当前流量无法在合理周期内判断；不要把短期波动包装成结论。`;

  return {
    required_sample_per_variant: samplePerVariant,
    estimated_duration_days: estimatedDays,
    status,
    rationale
  };
}

export function calculateRelativeChange(controlValue, variantValue) {
  const control = finiteNumber(controlValue);
  const variant = finiteNumber(variantValue);
  if (control === null || variant === null || control === 0) return null;
  return rounded(((variant - control) / Math.abs(control)) * 100, 2);
}

export function experimentConclusionComplete(experiment = {}) {
  const result = experiment.result || {};
  return result.outcome !== "pending"
    && Boolean(String(result.evidence || "").trim())
    && Boolean(String(result.learning || "").trim())
    && Boolean(String(result.next_action || "").trim());
}

export function enrichExperimentPlan(plan = {}) {
  return {
    ...plan,
    experiments: Array.isArray(plan.experiments)
      ? plan.experiments.map((experiment) => {
          const design = normalizeExperimentDesign(experiment.design);
          return {
            ...experiment,
            design,
            feasibility: calculateExperimentFeasibility(design),
            result: {
              ...experiment.result,
              relative_change_percent: calculateRelativeChange(experiment.result?.control_value, experiment.result?.variant_value)
            }
          };
        })
      : []
  };
}

export function experimentPlanSummary(plan = {}) {
  const experiments = Array.isArray(plan.experiments) ? plan.experiments : [];
  return {
    total: experiments.length,
    now: experiments.filter((item) => item.priority === "now").length,
    ready: experiments.filter((item) => item.feasibility?.status === "ready").length,
    needsData: experiments.filter((item) => item.feasibility?.status === "not_calculable").length,
    running: experiments.filter((item) => item.status === "running").length,
    concluded: experiments.filter((item) => item.status === "concluded").length,
    learnings: experiments.filter((item) => item.result?.learning?.trim()).length
  };
}
