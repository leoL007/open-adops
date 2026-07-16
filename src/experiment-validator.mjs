import { calculateExperimentFeasibility, calculateRelativeChange } from "../public/lib/experiments.js";

const PRIORITIES = new Set(["now", "next", "later"]);
const STATUSES = new Set(["draft", "ready", "running", "concluded", "archived"]);
const CATEGORIES = new Set(["creative", "audience", "bidding", "landing_page", "measurement", "campaign_structure"]);
const METRIC_TYPES = new Set(["rate", "cost", "revenue", "count", "composite"]);
const FEASIBILITY = new Set(["ready", "long_horizon", "insufficient_volume", "not_calculable"]);
const OUTCOMES = new Set(["pending", "winner", "loser", "inconclusive"]);

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalText(value) {
  return typeof value === "string";
}

function isNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function textArray(value, path, errors, minimum = 0) {
  if (!Array.isArray(value)) {
    errors.push(`${path} 必须是数组`);
    return;
  }
  if (value.length < minimum) errors.push(`${path} 至少需要 ${minimum} 项`);
  value.forEach((item, index) => {
    if (!isText(item)) errors.push(`${path}[${index}] 必须是非空文本`);
  });
}

export function validateExperimentPlan(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, errors: ["结果必须是 JSON 对象"] };
  }

  if (result.schema_version !== "1.0") errors.push("schema_version 必须为 1.0");
  if (!isText(result.title)) errors.push("title 必须是非空文本");
  if (!isText(result.executive_summary)) errors.push("executive_summary 必须是非空文本");
  textArray(result.learning_agenda, "learning_agenda", errors, 1);
  textArray(result.risks, "risks", errors, 1);

  if (!Array.isArray(result.experiments) || result.experiments.length === 0) {
    errors.push("experiments 至少需要 1 项");
    return { valid: errors.length === 0, errors };
  }
  if (result.experiments.length > 4) errors.push("experiments 最多允许 4 项");

  const ids = new Set();
  result.experiments.forEach((experiment, index) => {
    const path = `experiments[${index}]`;
    for (const field of ["id", "name", "platform", "owner"]) {
      if (!isText(experiment?.[field])) errors.push(`${path}.${field} 必须是非空文本`);
    }
    if (ids.has(experiment?.id)) errors.push(`${path}.id 不能重复`);
    ids.add(experiment?.id);
    if (!["launch_pack", "operator", "analysis"].includes(experiment?.source)) errors.push(`${path}.source 不合法`);
    if (!PRIORITIES.has(experiment?.priority)) errors.push(`${path}.priority 不合法`);
    if (!STATUSES.has(experiment?.status)) errors.push(`${path}.status 不合法`);
    if (!CATEGORIES.has(experiment?.category)) errors.push(`${path}.category 不合法`);

    const hypothesis = experiment?.hypothesis;
    for (const field of ["change", "metric", "because"]) {
      if (!isText(hypothesis?.[field])) errors.push(`${path}.hypothesis.${field} 必须是非空文本`);
    }
    if (!["increase", "decrease"].includes(hypothesis?.direction)) errors.push(`${path}.hypothesis.direction 不合法`);
    if (!isNullableNumber(hypothesis?.expected_lift_percent)) errors.push(`${path}.hypothesis.expected_lift_percent 必须是数字或 null`);

    const design = experiment?.design;
    for (const field of ["test_type", "control", "variant", "single_variable", "primary_metric"]) {
      if (!isText(design?.[field])) errors.push(`${path}.design.${field} 必须是非空文本`);
    }
    if (!METRIC_TYPES.has(design?.metric_type)) errors.push(`${path}.design.metric_type 不合法`);
    if (design?.metric_type === "cost" && hypothesis?.direction !== "decrease") {
      errors.push(`${path} 成本指标的 hypothesis.direction 必须为 decrease`);
    }
    textArray(design?.guardrail_metrics, `${path}.design.guardrail_metrics`, errors, 1);
    if (!(Number(design?.control_percent) > 0) || !(Number(design?.variant_percent) > 0)) errors.push(`${path} 的实验分流必须大于 0`);
    if (Math.abs(Number(design?.control_percent) + Number(design?.variant_percent) - 100) > 0.001) errors.push(`${path} 的 Control 与 Variant 分流合计必须为 100`);
    for (const field of ["baseline_rate_percent", "mde_percent", "daily_eligible_units"]) {
      if (!isNullableNumber(design?.[field])) errors.push(`${path}.design.${field} 必须是数字或 null`);
    }
    if (design?.baseline_rate_percent !== null && (!(design?.baseline_rate_percent > 0) || !(design?.baseline_rate_percent < 100))) {
      errors.push(`${path}.design.baseline_rate_percent 必须大于 0 且小于 100，或为 null`);
    }
    if (design?.mde_percent !== null && !(design?.mde_percent > 0)) errors.push(`${path}.design.mde_percent 必须大于 0，或为 null`);
    if (design?.daily_eligible_units !== null && !(design?.daily_eligible_units > 0)) errors.push(`${path}.design.daily_eligible_units 必须大于 0，或为 null`);
    if (![90, 95].includes(design?.confidence_percent)) errors.push(`${path}.design.confidence_percent 不合法`);
    if (design?.power_percent !== 80) errors.push(`${path}.design.power_percent 必须为 80`);
    if (!Number.isInteger(design?.minimum_days) || design.minimum_days < 1) errors.push(`${path}.design.minimum_days 必须是正整数`);
    if (!Number.isInteger(design?.maximum_days) || design.maximum_days < design?.minimum_days) errors.push(`${path}.design.maximum_days 必须不小于 minimum_days`);

    const expected = calculateExperimentFeasibility(design);
    const feasibility = experiment?.feasibility;
    if (!FEASIBILITY.has(feasibility?.status)) errors.push(`${path}.feasibility.status 不合法`);
    if (!isText(feasibility?.rationale)) errors.push(`${path}.feasibility.rationale 必须是非空文本`);
    if (feasibility?.required_sample_per_variant !== expected.required_sample_per_variant) errors.push(`${path}.feasibility.required_sample_per_variant 与确定性计算不一致`);
    if (feasibility?.estimated_duration_days !== expected.estimated_duration_days) errors.push(`${path}.feasibility.estimated_duration_days 与确定性计算不一致`);
    if (feasibility?.status !== expected.status) errors.push(`${path}.feasibility.status 与确定性计算不一致`);

    textArray(experiment?.setup_steps, `${path}.setup_steps`, errors, 2);
    textArray(experiment?.stop_conditions, `${path}.stop_conditions`, errors, 2);
    for (const field of ["win", "lose", "inconclusive"]) {
      if (!isText(experiment?.decision_rules?.[field])) errors.push(`${path}.decision_rules.${field} 必须是非空文本`);
    }

    const outcome = experiment?.result;
    if (!OUTCOMES.has(outcome?.outcome)) errors.push(`${path}.result.outcome 不合法`);
    for (const field of ["control_value", "variant_value", "relative_change_percent", "confidence_percent"]) {
      if (!isNullableNumber(outcome?.[field])) errors.push(`${path}.result.${field} 必须是数字或 null`);
    }
    for (const field of ["started_at", "ended_at", "learning", "next_action", "evidence"]) {
      if (!isOptionalText(outcome?.[field])) errors.push(`${path}.result.${field} 必须是文本`);
    }
    const expectedChange = calculateRelativeChange(outcome?.control_value, outcome?.variant_value);
    if (outcome?.relative_change_percent !== expectedChange) errors.push(`${path}.result.relative_change_percent 与确定性计算不一致`);
    if (experiment?.status === "concluded") {
      if (outcome?.outcome === "pending") errors.push(`${path} 已结束时必须填写 outcome`);
      for (const field of ["learning", "next_action", "evidence"]) {
        if (!isText(outcome?.[field])) errors.push(`${path} 已结束时 result.${field} 不能为空`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
