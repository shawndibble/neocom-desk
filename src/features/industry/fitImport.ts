/**
 * Fit Import's boundary: adapts the blueprint catalog to the shape
 * `engine/import/fitToBuildPlans` asks for, and turns what it returns into
 * Build Plan records (issue #626).
 *
 * The engine half is pure and knows nothing about the SDE; everything
 * catalog-shaped or Dexie-shaped lives here, the same split `fitToSkills` and
 * `clipboardImport` already use.
 */

import { db, type BuildPlanRecord } from '@/db';
import { scheduleSync } from '@/sync';
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  fitToBuildPlans,
  type FitBlueprintLookup,
  type FitBuildCandidate,
  type FitToBuildPlansResult,
} from '@/engine/import/fitToBuildPlans';
import { parseEftFit } from '@/engine/import/eftFit';
import type { FacilityDefaults } from './facilityDefaults';
import { findOwnedBlueprint } from './data';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { newBuildPlan } from './newBuildPlan';
import { addBuildGroup, type BuildGroupsValue } from './buildGroups';

/**
 * Lower-cased item name to typeID, built once per catalog.
 *
 * The catalog indexes types by id, not by name, and the map is over every type
 * in the SDE — thousands of entries. A fit paste resolves a dozen names, so
 * rebuilding it per keystroke (or per item) would dwarf the work it enables.
 * Keyed on the catalog object itself so it is discarded with it.
 */
const nameIndexes = new WeakMap<BlueprintCatalog, Map<string, number>>();

function nameIndexFor(catalog: BlueprintCatalog): Map<string, number> {
  const cached = nameIndexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, number>();
  // `for...in` rather than `Object.entries`, which would materialize a pair
  // array for every type in the SDE — thousands — to build one map.
  for (const idStr in catalog.typesById) {
    const key = catalog.typesById[idStr].name.toLowerCase();
    // First wins, like `byProductTypeID` — the SDE has no duplicate item names
    // in practice, and a later collision must not shadow a real product.
    if (!index.has(key)) index.set(key, Number(idStr));
  }
  nameIndexes.set(catalog, index);
  return index;
}

/**
 * Resolves an item name to the blueprint that makes it.
 *
 * Returns null for anything nothing produces — faction, named and meta modules
 * drop from NPCs and have no blueprint at all, which is a fifth of a routine
 * fit. The engine reports those as skipped rather than dropping them.
 */
export function fitBlueprintLookup(catalog: BlueprintCatalog): FitBlueprintLookup {
  const index = nameIndexFor(catalog);
  return (itemName) => {
    const typeID = index.get(itemName.trim().toLowerCase());
    if (typeID === undefined) return null;
    const entry = catalog.byProductTypeID.get(typeID);
    if (!entry) return null;
    const unitsPerRun = entry.blueprint.products[0]?.quantity ?? 1;
    return {
      blueprintTypeID: entry.blueprintTypeID,
      productTypeID: typeID,
      // The catalog's own name, not the fit's spelling, so a plan is named
      // the way every other plan for that product is.
      productName: entry.productName,
      unitsPerRun,
    };
  };
}

/** Parse and resolve a pasted fit in one step — what the dialog's Parse button runs. */
export function previewFitImport(
  text: string,
  catalog: BlueprintCatalog,
  options: { includeCharges?: boolean } = {}
): FitToBuildPlansResult {
  return fitToBuildPlans(parseEftFit(text), fitBlueprintLookup(catalog), options);
}

/**
 * What to call the build group a fit import creates. Four ways it lands, now
 * that a bare `[Ship]` header names a hull and no fit (issue #630): both
 * names, either one alone, or a header that gave neither. The labels come in
 * as callbacks so the i18next lookup stays at the route, where the rest of
 * this module's strings already live.
 */
export function fitImportGroupName(
  preview: FitToBuildPlansResult,
  labels: { withHull: (fit: string, ship: string) => string; untitled: string }
): string {
  const ship = preview.hull?.productName ?? null;
  if (preview.groupName && ship) return labels.withHull(preview.groupName, ship);
  return preview.groupName ?? ship ?? labels.untitled;
}

/** Everything the import needs in order to build records from a preview. */
export interface FitImportPlanContext {
  characterId: number;
  catalog: BlueprintCatalog;
  ownedBlueprints: readonly CharacterBlueprint[];
  /** The plan every created plan takes its facility/hub/system from (issue #456). */
  defaultsFrom: BuildPlanRecord | null;
  facilityDefaults: FacilityDefaults;
  /** ME to quote a blueprint the character owns no copy of — `sync.industryAssumedMe`. */
  assumedMe: number;
  /** TE for the same blueprints, from `sync.industryAssumedTe` (issue #634). */
  assumedTe: number;
  buildGroupId: string;
}

function entryFor(
  catalog: BlueprintCatalog,
  candidate: FitBuildCandidate
): BlueprintCatalogEntry | null {
  return catalog.byBlueprintTypeID.get(candidate.blueprintTypeID) ?? null;
}

/**
 * The Build Plans a preview turns into, hull first.
 *
 * Stamped newest-first from `Date.now()`, so `mostRecentlyUpdatedPlan`'s
 * strict `>` resolves the batch to the ship rather than to whichever member
 * Dexie happens to return first — otherwise the settings the pilot's next
 * hand-made plan inherits come from a random rig (issue #456). Stepping
 * *back* rather than nudging the hull forward: `Date.now()` is the newest any
 * of them may honestly claim, and it makes every member deterministic instead
 * of only the hull's boundary.
 */
export function fitImportPlans(
  preview: FitToBuildPlansResult,
  context: FitImportPlanContext
): BuildPlanRecord[] {
  const now = Date.now();
  const make = (candidate: FitBuildCandidate, updatedAt: number): BuildPlanRecord | null => {
    const entry = entryFor(context.catalog, candidate);
    if (!entry) return null;
    return newBuildPlan(
      context.characterId,
      entry,
      findOwnedBlueprint(context.ownedBlueprints, candidate.blueprintTypeID),
      context.defaultsFrom,
      context.facilityDefaults,
      {
        runs: candidate.runs,
        assumedMe: context.assumedMe,
        assumedTe: context.assumedTe,
        buildGroupId: context.buildGroupId,
        updatedAt,
      }
    );
  };

  const plans: BuildPlanRecord[] = [];
  const hull = preview.hull ? make(preview.hull, now) : null;
  if (hull) plans.push(hull);
  preview.items.forEach((candidate, index) => {
    const plan = make(candidate, now - 1 - index);
    if (plan) plans.push(plan);
  });
  return plans;
}

/** Everything `applyFitImport` needs beyond `fitImportPlanContext`, to also create the group that holds the plans. */
export interface FitImportApplyContext extends Omit<FitImportPlanContext, 'buildGroupId'> {
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
  groupName: string;
}

/**
 * Creates a Build Group and its plans from a Fit Import preview, and persists
 * both — the write behind the dialog's "Add" button.
 *
 * Write order matters and is owned here, not by the caller: the group's
 * record goes down *before* the plans that point at it, the same rule
 * `buildGroups.ts` documents for the delete path in reverse. A single
 * `bulkAdd` and one `scheduleSync` cover every plan, not one of each per plan
 * — see `fitImportPlans`. Returns `null`, having written nothing, when the
 * preview resolves to no buildable plans at all (an all-skipped paste).
 */
export async function applyFitImport(
  preview: FitToBuildPlansResult,
  context: FitImportApplyContext
): Promise<{ groupId: string } | null> {
  const buildGroupId = crypto.randomUUID();
  const newPlans = fitImportPlans(preview, { ...context, buildGroupId });
  if (newPlans.length === 0) return null;
  await context.setBuildGroups(
    addBuildGroup(context.buildGroups, context.characterId, {
      id: buildGroupId,
      name: context.groupName,
    })
  );
  await db.buildPlans.bulkAdd(newPlans);
  scheduleSync(context.characterId);
  return { groupId: buildGroupId };
}
