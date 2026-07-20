import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT_PROJECT,
  BACKUP_FORMAT_WORKSPACE,
  backupFileName,
  buildProjectBackup,
  buildWorkspaceBackup,
  mergeProjects,
  parseBackupJson
} from "../public/lib/workspace-backup.js";

test("workspace backup round-trips through JSON", () => {
  const state = {
    activeProjectId: "p1",
    aiMode: "mock",
    projects: [{ id: "p1", name: "Demo", industry: "工具" }]
  };
  const backup = buildWorkspaceBackup(state, { appVersion: "0.4.3", exportedAt: "2026-07-17T00:00:00.000Z" });
  assert.equal(backup.format, BACKUP_FORMAT_WORKSPACE);
  assert.equal(backup.projectCount, 1);
  const parsed = parseBackupJson(JSON.stringify(backup));
  assert.equal(parsed.kind, "workspace");
  assert.equal(parsed.projects[0].name, "Demo");
  assert.equal(parsed.activeProjectId, "p1");
});

test("project backup round-trips through JSON", () => {
  const project = { id: "p2", name: "Bifu 金融", platforms: ["Google Ads"] };
  const backup = buildProjectBackup(project, { appVersion: "0.4.3" });
  assert.equal(backup.format, BACKUP_FORMAT_PROJECT);
  const parsed = parseBackupJson(JSON.stringify(backup));
  assert.equal(parsed.kind, "project");
  assert.equal(parsed.projects.length, 1);
  assert.equal(parsed.projects[0].id, "p2");
});

test("mergeProjects reassigns conflicting ids", () => {
  const existing = [{ id: "a", name: "现有" }];
  const incoming = [{ id: "a", name: "导入冲突" }, { id: "b", name: "新项目" }];
  let n = 0;
  const { projects, imported } = mergeProjects(existing, incoming, {
    makeId: () => `new-${++n}`,
    reassignOnConflict: true
  });
  assert.equal(projects.length, 3);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].id, "new-1");
  assert.equal(imported[1].id, "b");
  assert.ok(projects.some((item) => item.name === "现有" && item.id === "a"));
});

test("mergeProjects reassigns duplicate ids within one import", () => {
  const incoming = [{ id: "same", name: "A" }, { id: "same", name: "B" }];
  let n = 0;
  const { imported } = mergeProjects([], incoming, {
    makeId: () => `new-${++n}`,
    reassignOnConflict: true
  });
  assert.deepEqual(imported.map((item) => item.id), ["same", "new-1"]);
});

test("parseBackupJson rejects unknown payloads", () => {
  assert.throws(() => parseBackupJson("{}"), /无法识别/);
  assert.throws(() => parseBackupJson("not-json"), /合法 JSON/);
});

test("parseBackupJson rejects unsupported schema versions", () => {
  const payload = {
    format: BACKUP_FORMAT_WORKSPACE,
    schemaVersion: 999,
    state: { projects: [{ id: "p1", name: "Demo" }] }
  };
  assert.throws(() => parseBackupJson(JSON.stringify(payload)), /不支持的备份版本/);
});

test("parseBackupJson rejects malformed projects and duplicate ids", () => {
  const malformed = {
    format: BACKUP_FORMAT_WORKSPACE,
    schemaVersion: 1,
    state: { projects: ["garbage"] }
  };
  assert.throws(() => parseBackupJson(JSON.stringify(malformed)), /项目结构无效/);

  const duplicate = {
    format: BACKUP_FORMAT_WORKSPACE,
    schemaVersion: 1,
    state: { projects: [{ id: "dup", name: "A" }, { id: "dup", name: "B" }] }
  };
  assert.throws(() => parseBackupJson(JSON.stringify(duplicate)), /重复项目 ID/);
});

test("backupFileName sanitizes project names", () => {
  assert.match(backupFileName({ kind: "project", projectName: "A/B:测试", exportedAt: "2026-07-17" }), /A-B-测试-openadops-project-2026-07-17\.json/);
  assert.equal(backupFileName({ kind: "workspace", exportedAt: "2026-07-17T12:00:00Z" }), "openadops-workspace-2026-07-17.json");
});
