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

export function calculateExperimentFeasibility(design = {}) {
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

export function enrichExperimentPlan(plan = {}) {
  return {
    ...plan,
    experiments: Array.isArray(plan.experiments)
      ? plan.experiments.map((experiment) => ({
          ...experiment,
          feasibility: calculateExperimentFeasibility(experiment.design),
          result: {
            ...experiment.result,
            relative_change_percent: calculateRelativeChange(experiment.result?.control_value, experiment.result?.variant_value)
          }
        }))
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
