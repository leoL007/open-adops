const LEVELS = new Set(["high", "medium", "low"]);
const PLACEHOLDER_TEXT = /^(?:\.{1,}|…+|⋯+|·+|•+|—+|-+|_+|待(?:补充|填写|定|确认)|TBD|N\/A|n\/a|null|undefined)$/i;

function isText(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (text.length < 2) return false;
  if (PLACEHOLDER_TEXT.test(text)) return false;
  return true;
}

export function validateAnalysis(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, errors: ["结果必须是 JSON 对象"] };
  }
  if (!isText(result.executive_summary)) {
    errors.push("executive_summary 必须是有意义的非空文本，禁止使用 \"...\" 等占位符");
  }
  for (const key of ["findings", "creative_tests", "next_actions"]) {
    if (!Array.isArray(result[key])) errors.push(`${key} 必须是数组`);
  }

  if (Array.isArray(result.findings)) {
    if (result.findings.length === 0) errors.push("findings 不能为空");
    result.findings.forEach((item, index) => {
      for (const field of ["title", "evidence", "diagnosis", "action", "validation"]) {
        if (!isText(item?.[field])) {
          errors.push(`findings[${index}].${field} 必须是有意义的非空文本，禁止使用 \"...\" 等占位符`);
        }
      }
      if (!LEVELS.has(item?.priority)) errors.push(`findings[${index}].priority 不合法`);
      if (!LEVELS.has(item?.confidence)) errors.push(`findings[${index}].confidence 不合法`);
    });
  }

  if (Array.isArray(result.creative_tests)) {
    if (result.creative_tests.length === 0) errors.push("creative_tests 不能为空");
    result.creative_tests.forEach((item, index) => {
      for (const field of ["angle", "hook", "platform", "variable", "success_metric"]) {
        if (!isText(item?.[field])) {
          errors.push(`creative_tests[${index}].${field} 必须是有意义的非空文本，禁止使用 \"...\" 等占位符`);
        }
      }
    });
  }

  if (Array.isArray(result.next_actions)) {
    if (result.next_actions.length === 0) errors.push("next_actions 不能为空");
    result.next_actions.forEach((item, index) => {
      for (const field of ["action", "owner", "timing", "success_metric"]) {
        if (!isText(item?.[field])) {
          errors.push(`next_actions[${index}].${field} 必须是有意义的非空文本，禁止使用 \"...\" 等占位符`);
        }
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
