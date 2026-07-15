const LEVELS = new Set(["high", "medium", "low"]);

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateAnalysis(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, errors: ["结果必须是 JSON 对象"] };
  }
  if (!isText(result.executive_summary)) errors.push("executive_summary 必须是非空文本");
  for (const key of ["findings", "creative_tests", "next_actions"]) {
    if (!Array.isArray(result[key])) errors.push(`${key} 必须是数组`);
  }

  if (Array.isArray(result.findings)) {
    result.findings.forEach((item, index) => {
      for (const field of ["title", "evidence", "diagnosis", "action", "validation"]) {
        if (!isText(item?.[field])) errors.push(`findings[${index}].${field} 必须是非空文本`);
      }
      if (!LEVELS.has(item?.priority)) errors.push(`findings[${index}].priority 不合法`);
      if (!LEVELS.has(item?.confidence)) errors.push(`findings[${index}].confidence 不合法`);
    });
  }

  if (Array.isArray(result.creative_tests)) {
    result.creative_tests.forEach((item, index) => {
      for (const field of ["angle", "hook", "platform", "variable", "success_metric"]) {
        if (!isText(item?.[field])) errors.push(`creative_tests[${index}].${field} 必须是非空文本`);
      }
    });
  }

  if (Array.isArray(result.next_actions)) {
    result.next_actions.forEach((item, index) => {
      for (const field of ["action", "owner", "timing", "success_metric"]) {
        if (!isText(item?.[field])) errors.push(`next_actions[${index}].${field} 必须是非空文本`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
