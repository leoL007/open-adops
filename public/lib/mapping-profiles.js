import { FIELD_LABELS } from "./analytics.js";

const MAPPING_FIELDS = Object.keys(FIELD_LABELS);

function cleanText(value) {
  return String(value || "").trim();
}

function normalizedMapping(mapping, headers = null) {
  const available = headers ? new Set(headers.map(cleanText)) : null;
  return Object.fromEntries(MAPPING_FIELDS.map((field) => {
    const source = cleanText(mapping?.[field]);
    return [field, source && (!available || available.has(source)) ? source : ""];
  }));
}

function normalizedHeaders(headers) {
  return [...new Set((Array.isArray(headers) ? headers : []).map(cleanText).filter(Boolean))];
}

function normalizedProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const id = cleanText(profile.id);
  const name = cleanText(profile.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    mapping: normalizedMapping(profile.mapping),
    headers: normalizedHeaders(profile.headers),
    createdAt: cleanText(profile.createdAt),
    updatedAt: cleanText(profile.updatedAt)
  };
}

export function normalizeMappingProfiles(profiles) {
  const ids = new Set();
  return (Array.isArray(profiles) ? profiles : []).flatMap((profile) => {
    const normalized = normalizedProfile(profile);
    if (!normalized || ids.has(normalized.id)) return [];
    ids.add(normalized.id);
    return [normalized];
  });
}

export function mappingProfileCompatibility(profile, headers) {
  const normalized = normalizedProfile(profile);
  const available = new Set(normalizedHeaders(headers));
  const sources = normalized
    ? [...new Set(Object.values(normalized.mapping).filter(Boolean))]
    : [];
  const matched = sources.filter((source) => available.has(source)).length;
  return {
    matched,
    total: sources.length,
    ratio: sources.length ? matched / sources.length : 0
  };
}

export function applyMappingProfile(profile, headers) {
  const normalized = normalizedProfile(profile);
  if (!normalized) throw new Error("映射模板无效");
  const compatibility = mappingProfileCompatibility(normalized, headers);
  return {
    mapping: normalizedMapping(normalized.mapping, headers),
    compatibility
  };
}

export function upsertMappingProfile(profiles, input, {
  makeId,
  now = new Date().toISOString()
} = {}) {
  if (typeof makeId !== "function") throw new Error("保存映射模板需要 makeId");
  const name = cleanText(input?.name);
  if (!name) throw new Error("请填写模板名称");
  const mapping = normalizedMapping(input?.mapping);
  if (!Object.values(mapping).some(Boolean)) throw new Error("当前没有可保存的字段映射");

  const current = normalizeMappingProfiles(profiles);
  const requestedId = cleanText(input?.id);
  const existingIndex = current.findIndex((profile) => (
    (requestedId && profile.id === requestedId)
    || profile.name.toLowerCase() === name.toLowerCase()
  ));
  const existing = current[existingIndex];
  const profile = {
    id: existing?.id || requestedId || makeId(),
    name,
    mapping,
    headers: normalizedHeaders(input?.headers),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  if (existingIndex >= 0) current.splice(existingIndex, 1, profile);
  else current.push(profile);
  return { profiles: current, profile };
}

export function removeMappingProfile(profiles, id) {
  return normalizeMappingProfiles(profiles).filter((profile) => profile.id !== id);
}

export function suggestMappingProfile(profiles, headers) {
  const normalized = normalizeMappingProfiles(profiles);
  const ranked = normalized
    .map((profile) => ({ profile, ...mappingProfileCompatibility(profile, headers) }))
    .filter((item) => item.total > 0 && item.matched > 0)
    .sort((left, right) => right.ratio - left.ratio || right.matched - left.matched);
  return ranked[0]?.profile || null;
}

export function mergeMappingProfiles(existingProfiles, incomingProfiles, {
  makeId,
  now = new Date().toISOString()
} = {}) {
  if (typeof makeId !== "function") throw new Error("合并映射模板需要 makeId");
  const result = normalizeMappingProfiles(existingProfiles);
  const usedIds = new Set(result.map((profile) => profile.id));
  const usedNames = new Set(result.map((profile) => profile.name.toLowerCase()));
  const imported = [];

  for (const incoming of normalizeMappingProfiles(incomingProfiles)) {
    let id = incoming.id;
    if (usedIds.has(id)) id = makeId();
    let name = incoming.name;
    if (usedNames.has(name.toLowerCase())) {
      const base = `${name}（导入）`;
      name = base;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) name = `${base}${suffix++}`;
    }
    const profile = { ...incoming, id, name, updatedAt: now };
    result.push(profile);
    imported.push(profile);
    usedIds.add(id);
    usedNames.add(name.toLowerCase());
  }
  return { profiles: result, imported };
}
