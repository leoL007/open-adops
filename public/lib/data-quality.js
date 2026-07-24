function count(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

export function dataQualityIssues(data) {
  if (!data) return [];
  const issues = [];
  const invalidCells = count(data.numericQuality?.invalidCells);
  const blankCells = count(data.numericQuality?.blankCells);
  const invalidDates = count(data.dateQuality?.invalidRows);
  if (invalidCells > 0) issues.push(`${invalidCells} 个异常数值，需重新导入`);
  if (blankCells > 0) issues.push(`${blankCells} 个空白数值按 0 计入`);
  if (invalidDates > 0) issues.push(`${invalidDates} 行日期无效，未进入周期与对比`);
  return issues;
}

export function dataQualityChecks(data) {
  if (!data) return { numeric: "not-imported", date: "not-imported" };
  const availableFields = new Set(Array.isArray(data.availableFields) ? data.availableFields : []);
  return {
    numeric: data.numericQuality ? "checked" : "unchecked",
    date: !availableFields.has("date")
      ? "not-mapped"
      : data.dateQuality
        ? "checked"
        : "unchecked"
  };
}

export function dataQualityNeedsAttention(data) {
  if (!data) return false;
  const checks = dataQualityChecks(data);
  return Boolean(
    dataQualityIssues(data).length
    || checks.numeric === "unchecked"
    || checks.date === "unchecked"
  );
}

export function dataQualityText(data) {
  if (!data) return "未导入";
  const issues = dataQualityIssues(data);
  const checks = dataQualityChecks(data);
  const parts = [];

  if (checks.numeric === "unchecked") {
    parts.push("数值未检查（重新导入后生成）");
  } else if (!issues.some((item) => item.includes("数值"))) {
    parts.push("数值未发现异常");
  }

  if (checks.date === "unchecked") {
    parts.push("日期未检查（重新导入后生成）");
  } else if (checks.date === "not-mapped") {
    parts.push("日期未映射");
  } else if (!issues.some((item) => item.includes("日期"))) {
    parts.push("日期未发现异常");
  }

  return [...issues, ...parts].join("；");
}
