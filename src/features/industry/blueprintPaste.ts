import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { parseBlueprintList } from '@/engine/import/blueprintList';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { findOwnedBlueprint } from './data';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { addBuildGroup, buildGroupsFor, type BuildGroupsValue } from './buildGroups';
import { createBuildPlans } from './buildPlanStore';
import { newBuildPlan } from './newBuildPlan';

export interface BlueprintPastePreview {
  entries: BlueprintCatalogEntry[];
  skipped: number;
}

const byNameIndexes = new WeakMap<BlueprintCatalog, Map<string, BlueprintCatalogEntry>>();

function entryByName(catalog: BlueprintCatalog): Map<string, BlueprintCatalogEntry> {
  const cached = byNameIndexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, BlueprintCatalogEntry>();
  for (const entry of catalog.entries) {
    const key = entry.blueprint.name.toLowerCase();
    if (!index.has(key)) index.set(key, entry);
  }
  byNameIndexes.set(catalog, index);
  return index;
}

export function previewBlueprintPaste(
  text: string,
  catalog: BlueprintCatalog,
  blueprintNames: ReadonlySet<string>
): BlueprintPastePreview {
  const index = entryByName(catalog);
  const entries: BlueprintCatalogEntry[] = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const name of parseBlueprintList(text, blueprintNames)) {
    const entry = index.get(name);
    if (!entry) skipped++;
    else if (!seen.has(entry.blueprintTypeID)) {
      seen.add(entry.blueprintTypeID);
      entries.push(entry);
    }
  }
  return { entries, skipped };
}

export function findGroupOfBlueprints(
  buildGroups: BuildGroupsValue,
  plans: readonly BuildPlanRecord[],
  characterId: number,
  blueprintTypeIDs: readonly number[]
): string | null {
  const wanted = new Set(blueprintTypeIDs);
  for (const group of buildGroupsFor(buildGroups, characterId)) {
    const members = plans.filter((p) => p.buildGroupId === group.id);
    if (members.length !== wanted.size) continue;
    if (members.every((p) => wanted.has(p.blueprintTypeID))) {
      if (new Set(members.map((p) => p.blueprintTypeID)).size === wanted.size) return group.id;
    }
  }
  return null;
}

export interface BlueprintPasteContext {
  characterId: number;
  plans: readonly BuildPlanRecord[];
  ownedBlueprints: readonly CharacterBlueprint[];
  facilityDefaults: ActivityFacilityDefaults;
  defaultsFrom: BuildPlanRecord | null;
  assumedMe: number;
  assumedTe: number;
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
  groupName: string;
}

export async function applyBlueprintPaste(
  preview: BlueprintPastePreview,
  context: BlueprintPasteContext
): Promise<{ groupId: string; reused: boolean } | null> {
  if (preview.entries.length === 0) return null;
  const existing = findGroupOfBlueprints(
    context.buildGroups,
    context.plans,
    context.characterId,
    preview.entries.map((e) => e.blueprintTypeID)
  );
  if (existing) return { groupId: existing, reused: true };

  const buildGroupId = crypto.randomUUID();
  const now = Date.now();
  const plans = preview.entries.map((entry, index) =>
    newBuildPlan(
      context.characterId,
      entry,
      findOwnedBlueprint(context.ownedBlueprints, entry.blueprintTypeID),
      context.defaultsFrom,
      context.facilityDefaults,
      {
        assumedMe: context.assumedMe,
        assumedTe: context.assumedTe,
        buildGroupId,
        updatedAt: now - index,
      }
    )
  );
  await context.setBuildGroups(
    addBuildGroup(context.buildGroups, context.characterId, {
      id: buildGroupId,
      name: context.groupName,
    })
  );
  await createBuildPlans(plans);
  return { groupId: buildGroupId, reused: false };
}
