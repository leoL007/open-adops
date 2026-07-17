export const BACKUP_FORMAT_WORKSPACE = "openadops-workspace";
export const BACKUP_FORMAT_PROJECT = "openadops-project";
export const BACKUP_SCHEMA_VERSION = 1;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFilePart(value) {
  return String(value || "openadops")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "openadops";
}

export function buildWorkspaceBackup(state, { appVersion = "", exportedAt = new Date().toISOString() } = {}) {
  if (!isObject(state) || !Array.isArray(state.projects)) {
    throw new Error("工作区状态无效，无法导出");
  }
  return {
    format: BACKUP_FORMAT_WORKSPACE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt,
    projectCount: state.projects.length,
    state: {
      activeProjectId: state.activeProjectId || state.projects[0]?.id || "",
      aiMode: state.aiMode === "codex" ? "codex" : "mock",
      projects: state.projects
    }
  };
}

export function buildProjectBackup(project, { appVersion = "", exportedAt = new Date().toISOString() } = {}) {
  if (!isObject(project) || !project.id || !project.name) {
    throw new Error("项目无效，无法导出");
  }
  return {
    format: BACKUP_FORMAT_PROJECT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt,
    project
  };
}

export function parseBackupJson(text) {
  let payload;
  try {
    payload = JSON.parse(String(text || ""));
  } catch {
    throw new Error("备份文件不是合法 JSON");
  }
  if (!isObject(payload)) throw new Error("备份文件结构无效");

  if (payload.format === BACKUP_FORMAT_WORKSPACE) {
    const projects = payload.state?.projects;
    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error("工作区备份中没有项目");
    }
    return {
      kind: "workspace",
      schemaVersion: Number(payload.schemaVersion) || 1,
      appVersion: String(payload.appVersion || ""),
      exportedAt: String(payload.exportedAt || ""),
      projects,
      activeProjectId: payload.state?.activeProjectId || projects[0]?.id || "",
      aiMode: payload.state?.aiMode === "codex" ? "codex" : "mock"
    };
  }

  if (payload.format === BACKUP_FORMAT_PROJECT) {
    if (!isObject(payload.project) || !payload.project.id) {
      throw new Error("项目备份中没有有效项目");
    }
    return {
      kind: "project",
      schemaVersion: Number(payload.schemaVersion) || 1,
      appVersion: String(payload.appVersion || ""),
      exportedAt: String(payload.exportedAt || ""),
      projects: [payload.project],
      activeProjectId: payload.project.id,
      aiMode: "mock"
    };
  }

  // Tolerate raw state dumps saved manually.
  if (Array.isArray(payload.projects) && payload.projects.length) {
    return {
      kind: "workspace",
      schemaVersion: 1,
      appVersion: "",
      exportedAt: "",
      projects: payload.projects,
      activeProjectId: payload.activeProjectId || payload.projects[0]?.id || "",
      aiMode: payload.aiMode === "codex" ? "codex" : "mock"
    };
  }

  throw new Error("无法识别的备份格式（需要 openadops-workspace 或 openadops-project）");
}

export function mergeProjects(existingProjects, incomingProjects, { makeId, reassignOnConflict = true } = {}) {
  if (typeof makeId !== "function") throw new Error("mergeProjects 需要 makeId");
  const result = Array.isArray(existingProjects) ? [...existingProjects] : [];
  const usedIds = new Set(result.map((item) => item?.id).filter(Boolean));
  const imported = [];

  for (const raw of incomingProjects || []) {
    if (!isObject(raw)) continue;
    let project = { ...raw };
    if (!project.id || (usedIds.has(project.id) && reassignOnConflict)) {
      project = { ...project, id: makeId() };
    }
    if (!project.name) project.name = "导入项目";
    if (!project.createdAt) project.createdAt = new Date().toISOString();
    project.updatedAt = new Date().toISOString();
    usedIds.add(project.id);
    result.push(project);
    imported.push(project);
  }

  return { projects: result, imported };
}

export function backupFileName({ kind, projectName, exportedAt = new Date().toISOString() } = {}) {
  const day = String(exportedAt).slice(0, 10) || "backup";
  if (kind === "project") {
    return `${sanitizeFilePart(projectName)}-openadops-project-${day}.json`;
  }
  return `openadops-workspace-${day}.json`;
}
