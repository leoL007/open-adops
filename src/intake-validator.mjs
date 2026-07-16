const BRIEF_KEYS = new Set(["product", "industry", "markets", "objective", "platforms", "budget", "kpi", "conversion_event", "timeline", "audience", "creative_supply", "attribution", "compliance", "constraints"]);
const STATUSES = new Set(["confirmed", "inferred", "missing"]);
const SOURCES = new Set(["offer", "client_strategy", "operator_notes", "ai_inference", "unknown"]);
const QUESTION_PRIORITIES = new Set(["required", "recommended"]);

function isText(value, allowEmpty = false) {
  return typeof value === "string" && (allowEmpty || value.trim().length > 0);
}

function validateTextArray(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} 必须是非空数组`);
    return;
  }
  value.forEach((item, index) => {
    if (!isText(item)) errors.push(`${path}[${index}] 必须是非空文本`);
  });
}

export function validateIntake(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, errors: ["结果必须是 JSON 对象"] };
  }
  if (!isText(result.executive_summary)) errors.push("executive_summary 必须是非空文本");

  if (!Array.isArray(result.brief_fields)) {
    errors.push("brief_fields 必须是数组");
  } else {
    const seen = new Set();
    result.brief_fields.forEach((field, index) => {
      if (!BRIEF_KEYS.has(field?.key)) errors.push(`brief_fields[${index}].key 不合法`);
      if (seen.has(field?.key)) errors.push(`brief_fields[${index}].key 重复`);
      seen.add(field?.key);
      if (!isText(field?.value, true)) errors.push(`brief_fields[${index}].value 必须是文本`);
      if (!STATUSES.has(field?.status)) errors.push(`brief_fields[${index}].status 不合法`);
      if (!SOURCES.has(field?.source)) errors.push(`brief_fields[${index}].source 不合法`);
      if (!isText(field?.evidence, true)) errors.push(`brief_fields[${index}].evidence 必须是文本`);
      if (field?.status === "missing" && field?.value) errors.push(`brief_fields[${index}] 缺失字段不应包含值`);
    });
    for (const key of BRIEF_KEYS) {
      if (!seen.has(key)) errors.push(`brief_fields 缺少 ${key}`);
    }
  }

  if (!Array.isArray(result.clarification_questions)) {
    errors.push("clarification_questions 必须是数组");
  } else {
    result.clarification_questions.forEach((item, index) => {
      if (!BRIEF_KEYS.has(item?.field_key)) errors.push(`clarification_questions[${index}].field_key 不合法`);
      if (!isText(item?.question)) errors.push(`clarification_questions[${index}].question 必须是非空文本`);
      if (!isText(item?.reason)) errors.push(`clarification_questions[${index}].reason 必须是非空文本`);
      if (!QUESTION_PRIORITIES.has(item?.priority)) errors.push(`clarification_questions[${index}].priority 不合法`);
    });
  }

  const draft = result.strategy_draft;
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    errors.push("strategy_draft 必须是对象");
  } else {
    if (!isText(draft.positioning)) errors.push("strategy_draft.positioning 必须是非空文本");
    for (const key of ["working_assumptions", "campaign_plan", "creative_plan", "measurement_plan", "first_week_plan", "risks"]) {
      validateTextArray(draft[key], `strategy_draft.${key}`, errors);
    }
    if (!Array.isArray(draft.platform_plan) || draft.platform_plan.length === 0) {
      errors.push("strategy_draft.platform_plan 必须是非空数组");
    } else {
      draft.platform_plan.forEach((item, index) => {
        for (const key of ["platform", "role", "rationale", "budget_scenario"]) {
          if (!isText(item?.[key])) errors.push(`strategy_draft.platform_plan[${index}].${key} 必须是非空文本`);
        }
      });
    }
  }
  return { valid: errors.length === 0, errors };
}
