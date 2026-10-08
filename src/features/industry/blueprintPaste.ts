/**
 * A pasted blueprint list becomes a **Build Group** of Build Plans, one per
 * blueprint (issue #2982). The paste router sends the text to `/industry`,
 * which calls `applyBlueprintPaste`.
 *
 * Pasting the same list twice reuses the group the first paste made instead of
 * stacking a duplicate: the router acts on a paste the pilot never aimed at a
 * field, so a repeat is likelier an accident or a re-check than a wish for a
 * second copy. "Same list" means a group whose plans cover exactly the
 * pasted blueprints; a group the pilot has since edited counts as theirs and
 * a new one is made.
 */
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
  /** One entry per distinct buildable blueprint, in paste order. */
  entries: BlueprintCatalogEntry[];
  /** Distinct pasted blueprints a Build Plan cannot cover. */
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

/** The id of a group whose plans are exactly `blueprintTypeIDs`, if any. */
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
  /** Where every created plan builds: the pilot's remembered location per activity. */
  facilityDefaults: ActivityFacilityDefaults;
  defaultsFrom: BuildPlanRecord | null;
  assumedMe: number;
  assumedTe: number;
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
  groupName: string;
}

/**
 * Creates the group and its plans, or finds the one an earlier identical paste
 * made. Null (nothing written) when no pasted blueprint is buildable. The
 * group is written before its plans, like every Build Group creator.
 */
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
  // Stamped newest-first so the batch has one deterministic "latest" plan for
  // the next hand-made plan's defaults (see `fitImportPlans`).
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
