const CATEGORIES = new Set(["casting", "copy", "scene", "culture_policy", "production", "platform"]);
const STATUSES = new Set(["required", "recommended", "confirm"]);
const PLACEHOLDER = /^(?:\.{1,}|…+|⋯+|·+|•+|—+|-+|待(?:补充|填写|定|确认)|TBD|N\/A|null|undefined)$/i;

function meaningful(value, { allowEmpty = false } = {}) {
  if (typeof value !== "string") return false;
  const content = value.trim();
  if (!content) return allowEmpty;
  return content.length >= 2 && !PLACEHOLDER.test(content);
}

function uniqueIds(items, key, errors) {
  const ids = new Set();
  items.forEach((item, index) => {
    if (!meaningful(item?.id)) errors.push(`${key}[${index}].id 不合法`);
    else if (ids.has(item.id)) errors.push(`${key}[${index}].id 重复`);
    else ids.add(item.id);
  });
}

export function validateCreativeRequirements(result) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, errors: ["结果必须是 JSON 对象"] };
  }
  if (result.schema_version !== "2.0") errors.push("schema_version 必须为 2.0");
  if (!meaningful(result.executive_summary)) errors.push("executive_summary 必须是完整文本");
  if (!Array.isArray(result.guidance) || result.guidance.length < 1) errors.push("guidance 至少需要 1 项");
  if (!Array.isArray(result.suggestions)) errors.push("suggestions 必须是数组");

  if (Array.isArray(result.guidance)) {
    uniqueIds(result.guidance, "guidance", errors);
    result.guidance.forEach((item, index) => {
      if (!CATEGORIES.has(item?.category)) errors.push(`guidance[${index}].category 不合法`);
      if (!STATUSES.has(item?.status)) errors.push(`guidance[${index}].status 不合法`);
      if (!meaningful(item?.item)) errors.push(`guidance[${index}].item 必须是完整文本`);
      if (!meaningful(item?.reason)) errors.push(`guidance[${index}].reason 必须是完整文本`);
    });
  }

  if (Array.isArray(result.suggestions)) {
    uniqueIds(result.suggestions, "suggestions", errors);
    result.suggestions.forEach((item, index) => {
      for (const field of ["modification_notes", "rationale"]) {
        if (!meaningful(item?.[field])) errors.push(`suggestions[${index}].${field} 必须是完整文本`);
      }
      for (const field of ["asset_reference", "copy", "format"]) {
        if (!meaningful(item?.[field], { allowEmpty: true })) errors.push(`suggestions[${index}].${field} 不合法`);
      }
      if (item?.quantity !== null && (!Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 20)) errors.push(`suggestions[${index}].quantity 必须为 null 或 1–20 的整数`);
    });
  }
  return { valid: errors.length === 0, errors };
}
