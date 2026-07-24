function errorText(error) {
  return String(error?.message || error || "未知错误");
}

export function isStorageQuotaError(error) {
  return error?.name === "QuotaExceededError" || /quota|storage/i.test(errorText(error));
}

export function loadWorkspaceState({
  storage,
  currentKey,
  previousKeys = [],
  normalize,
  createFallback
} = {}) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("缺少可用的浏览器存储");
  }
  if (!currentKey || typeof normalize !== "function" || typeof createFallback !== "function") {
    throw new Error("工作区加载参数不完整");
  }

  const warnings = [];
  for (const key of [currentKey, ...previousKeys]) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      warnings.push({ type: "read_failed", key, message: errorText(error) });
      continue;
    }
    if (!raw) continue;

    let stored;
    try {
      stored = JSON.parse(raw);
    } catch (error) {
      warnings.push({ type: "invalid_json", key, message: errorText(error) });
      continue;
    }
    if (!Array.isArray(stored?.projects) || stored.projects.length === 0) {
      warnings.push({ type: "invalid_workspace", key, message: "工作区中没有有效项目" });
      continue;
    }

    let state;
    try {
      state = normalize(stored);
    } catch (error) {
      warnings.push({ type: "normalize_failed", key, message: errorText(error) });
      continue;
    }

    let persisted = true;
    try {
      storage.setItem(currentKey, JSON.stringify(state));
    } catch (error) {
      persisted = false;
      warnings.push({
        type: isStorageQuotaError(error) ? "write_quota" : "write_failed",
        key: currentKey,
        message: errorText(error)
      });
    }
    return { state, sourceKey: key, persisted, warnings };
  }

  return {
    state: createFallback(),
    sourceKey: null,
    persisted: true,
    warnings
  };
}

export function workspaceLoadWarning(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (!warnings.length) return "";
  if (warnings.some((item) => item.type === "write_quota")) {
    return "现有项目已读取，但浏览器存储空间不足，迁移结果未写回。请立即导出全部备份并清理旧项目。";
  }
  if (warnings.some((item) => item.type === "write_failed")) {
    return "现有项目已读取，但浏览器存储写回失败。请立即导出全部备份。";
  }
  if (result?.sourceKey) {
    return "当前工作区数据异常，已从可读取的旧版本恢复。请检查项目并导出全部备份。";
  }
  return "未能读取现有工作区，已进入演示项目。请通过「导入备份」恢复数据。";
}
