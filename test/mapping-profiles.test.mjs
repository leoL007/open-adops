import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMappingProfile,
  mappingProfileCompatibility,
  mergeMappingProfiles,
  normalizeMappingProfiles,
  removeMappingProfile,
  suggestMappingProfile,
  upsertMappingProfile
} from "../public/lib/mapping-profiles.js";

const mapping = {
  spend: "Amount Spent",
  installs: "Media Installs",
  af_installs: "AF Installs"
};

test("mapping profiles keep media and AF install identities", () => {
  const { profile } = upsertMappingProfile([], {
    name: "AppsFlyer 标准",
    mapping,
    headers: Object.values(mapping)
  }, { makeId: () => "profile-1", now: "2026-07-20T00:00:00.000Z" });
  const applied = applyMappingProfile(profile, ["Amount Spent", "AF Installs", "Media Installs"]);
  assert.equal(applied.mapping.installs, "Media Installs");
  assert.equal(applied.mapping.af_installs, "AF Installs");
  assert.deepEqual(applied.compatibility, { matched: 3, total: 3, ratio: 1 });
});

test("applying a profile clears unavailable source columns", () => {
  const profile = {
    id: "profile-1",
    name: "媒体报表",
    mapping,
    headers: Object.values(mapping)
  };
  const applied = applyMappingProfile(profile, ["Amount Spent", "Media Installs"]);
  assert.equal(applied.mapping.spend, "Amount Spent");
  assert.equal(applied.mapping.installs, "Media Installs");
  assert.equal(applied.mapping.af_installs, "");
  assert.deepEqual(applied.compatibility, { matched: 2, total: 3, ratio: 2 / 3 });
});

test("upsert replaces a case-insensitive duplicate name", () => {
  const first = upsertMappingProfile([], { name: "Meta Export", mapping }, {
    makeId: () => "profile-1",
    now: "2026-07-20T00:00:00.000Z"
  });
  const second = upsertMappingProfile(first.profiles, {
    name: "meta export",
    mapping: { spend: "Cost" }
  }, { makeId: () => "unused", now: "2026-07-20T01:00:00.000Z" });
  assert.equal(second.profiles.length, 1);
  assert.equal(second.profile.id, "profile-1");
  assert.equal(second.profile.mapping.spend, "Cost");
});

test("suggestion ranks profiles by compatible mapped columns", () => {
  const profiles = normalizeMappingProfiles([
    { id: "a", name: "A", mapping: { spend: "Spend", clicks: "Clicks" } },
    { id: "b", name: "B", mapping: { spend: "Cost", clicks: "Taps", af_installs: "AF Installs" } }
  ]);
  assert.equal(suggestMappingProfile(profiles, ["Cost", "Taps", "AF Installs"]).id, "b");
  assert.deepEqual(mappingProfileCompatibility(profiles[0], ["Spend"]), { matched: 1, total: 2, ratio: 0.5 });
});

test("remove and merge profiles avoid destructive conflicts", () => {
  const existing = [{ id: "same", name: "AppsFlyer", mapping }];
  const incoming = [{ id: "same", name: "AppsFlyer", mapping: { spend: "Cost" } }];
  const merged = mergeMappingProfiles(existing, incoming, {
    makeId: () => "new-id",
    now: "2026-07-20T00:00:00.000Z"
  });
  assert.equal(merged.profiles.length, 2);
  assert.equal(merged.imported[0].id, "new-id");
  assert.equal(merged.imported[0].name, "AppsFlyer（导入）");
  assert.equal(removeMappingProfile(merged.profiles, "same").length, 1);
});
