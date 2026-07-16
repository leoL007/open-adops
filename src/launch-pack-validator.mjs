const READINESS = new Set(["ready", "conditional", "blocked"]);
const CHECK_STATUSES = new Set(["ready", "needs_confirmation", "blocker"]);
const CHECK_CATEGORIES = new Set(["strategy", "tracking", "campaign", "creative", "compliance", "operations"]);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function textArray(value, path, errors, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${path} 必须是${allowEmpty ? "" : "非空"}数组`);
    return;
  }
  value.forEach((item, index) => {
    if (!isText(item)) errors.push(`${path}[${index}] 必须是非空文本`);
  });
}

function uniqueIds(items, path, errors) {
  const ids = new Set();
  items.forEach((item, index) => {
    if (!isText(item?.id)) errors.push(`${path}[${index}].id 必须是非空文本`);
    if (ids.has(item?.id)) errors.push(`${path}[${index}].id 重复`);
    ids.add(item?.id);
  });
}

export function validateLaunchPack(result) {
  const errors = [];
  if (!isObject(result)) return { valid: false, errors: ["结果必须是 JSON 对象"] };
  if (result.schema_version !== "1.0") errors.push("schema_version 必须为 1.0");
  for (const key of ["title", "executive_summary"]) {
    if (!isText(result[key])) errors.push(`${key} 必须是非空文本`);
  }

  if (!isObject(result.readiness)) {
    errors.push("readiness 必须是对象");
  } else {
    if (!Number.isInteger(result.readiness.score) || result.readiness.score < 0 || result.readiness.score > 100) errors.push("readiness.score 必须是 0-100 整数");
    if (!READINESS.has(result.readiness.status)) errors.push("readiness.status 不合法");
    textArray(result.readiness.blockers, "readiness.blockers", errors, true);
  }

  textArray(result.assumptions, "assumptions", errors, true);
  textArray(result.open_questions, "open_questions", errors, true);
  textArray(result.risks, "risks", errors);

  if (!Array.isArray(result.media_plan) || result.media_plan.length === 0) {
    errors.push("media_plan 必须是非空数组");
  } else {
    result.media_plan.forEach((item, index) => {
      for (const key of ["platform", "role", "objective", "campaign_type", "currency", "rationale"]) {
        if (!isText(item?.[key])) errors.push(`media_plan[${index}].${key} 必须是非空文本`);
      }
      if (item?.allocation_percent !== null && (typeof item?.allocation_percent !== "number" || item.allocation_percent < 0 || item.allocation_percent > 100)) errors.push(`media_plan[${index}].allocation_percent 不合法`);
      if (item?.budget_amount !== null && (typeof item?.budget_amount !== "number" || item.budget_amount < 0)) errors.push(`media_plan[${index}].budget_amount 不合法`);
      if ((item?.allocation_percent === null) !== (item?.budget_amount === null)) errors.push(`media_plan[${index}] 预算占比和金额必须同时为空或同时有值`);
      textArray(item?.prerequisites, `media_plan[${index}].prerequisites`, errors, true);
    });
    const allocations = result.media_plan.map((item) => item.allocation_percent);
    if (allocations.every((value) => typeof value === "number")) {
      const total = allocations.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 100) > 0.01) errors.push(`media_plan 预算占比合计必须为 100，当前为 ${total}`);
    }
  }

  if (!Array.isArray(result.campaigns) || result.campaigns.length === 0) {
    errors.push("campaigns 必须是非空数组");
  } else {
    uniqueIds(result.campaigns, "campaigns", errors);
    result.campaigns.forEach((item, index) => {
      for (const key of ["platform", "campaign_name", "objective", "optimization_event", "geo", "bidding", "budget_note"]) {
        if (!isText(item?.[key])) errors.push(`campaigns[${index}].${key} 必须是非空文本`);
      }
      textArray(item?.ad_group_logic, `campaigns[${index}].ad_group_logic`, errors);
      textArray(item?.audience_notes, `campaigns[${index}].audience_notes`, errors);
    });
  }

  if (!Array.isArray(result.creative_briefs) || result.creative_briefs.length === 0) {
    errors.push("creative_briefs 必须是非空数组");
  } else {
    uniqueIds(result.creative_briefs, "creative_briefs", errors);
    result.creative_briefs.forEach((item, index) => {
      for (const key of ["platform", "hypothesis", "angle", "hook", "format", "test_variable", "success_metric"]) {
        if (!isText(item?.[key])) errors.push(`creative_briefs[${index}].${key} 必须是非空文本`);
      }
      if (!Number.isInteger(item?.variants) || item.variants < 1 || item.variants > 20) errors.push(`creative_briefs[${index}].variants 不合法`);
      textArray(item?.production_notes, `creative_briefs[${index}].production_notes`, errors);
      textArray(item?.compliance_notes, `creative_briefs[${index}].compliance_notes`, errors, true);
    });
  }

  if (!isObject(result.measurement)) {
    errors.push("measurement 必须是对象");
  } else {
    for (const key of ["source_of_truth", "primary_event"]) {
      if (!isText(result.measurement[key])) errors.push(`measurement.${key} 必须是非空文本`);
    }
    for (const key of ["supporting_events", "platform_feedback", "attribution_rules", "tracking_checklist"]) {
      textArray(result.measurement[key], `measurement.${key}`, errors);
    }
  }

  if (!Array.isArray(result.launch_checklist) || result.launch_checklist.length === 0) {
    errors.push("launch_checklist 必须是非空数组");
  } else {
    uniqueIds(result.launch_checklist, "launch_checklist", errors);
    result.launch_checklist.forEach((item, index) => {
      if (!CHECK_CATEGORIES.has(item?.category)) errors.push(`launch_checklist[${index}].category 不合法`);
      if (!CHECK_STATUSES.has(item?.status)) errors.push(`launch_checklist[${index}].status 不合法`);
      for (const key of ["item", "owner", "evidence"]) {
        if (!isText(item?.[key])) errors.push(`launch_checklist[${index}].${key} 必须是非空文本`);
      }
    });
  }

  if (!Array.isArray(result.first_7_days) || result.first_7_days.length === 0) {
    errors.push("first_7_days 必须是非空数组");
  } else {
    result.first_7_days.forEach((item, index) => {
      if (!isText(item?.period)) errors.push(`first_7_days[${index}].period 必须是非空文本`);
      if (!isText(item?.decision_rule)) errors.push(`first_7_days[${index}].decision_rule 必须是非空文本`);
      textArray(item?.actions, `first_7_days[${index}].actions`, errors);
    });
  }

  const blockers = result.launch_checklist?.filter((item) => item.status === "blocker").map((item) => item.item) || [];
  if (blockers.length && result.readiness?.status === "ready") errors.push("存在 blocker 时 readiness.status 不能为 ready");
  if (result.readiness?.blockers?.length !== blockers.length) errors.push("readiness.blockers 数量必须与 launch_checklist 中的 blocker 一致");

  return { valid: errors.length === 0, errors };
}
