import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  fitToBuildPlans,
  type FitBlueprintLookup,
  type FitBuildCandidate,
  type FitToBuildPlansResult,
} from '@/engine/import/fitToBuildPlans';
import { parseEftFit } from '@/engine/import/eftFit';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { findOwnedBlueprint } from './data';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { newBuildPlan } from './newBuildPlan';
import { addBuildGroup, type BuildGroupsValue } from './buildGroups';
import { createBuildPlans } from './buildPlanStore';

const nameIndexes = new WeakMap<BlueprintCatalog, Map<string, number>>();

function nameIndexFor(catalog: BlueprintCatalog): Map<string, number> {
  const cached = nameIndexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, number>();
  for (const idStr in catalog.typesById) {
    const key = catalog.typesById[idStr].name.toLowerCase();
    if (!index.has(key)) index.set(key, Number(idStr));
  }
  nameIndexes.set(catalog, index);
  return index;
}

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
      productName: entry.productName,
      unitsPerRun,
    };
  };
}

export function previewFitImport(
  text: string,
  catalog: BlueprintCatalog,
  options: { includeCharges?: boolean } = {}
): FitToBuildPlansResult {
  return fitToBuildPlans(parseEftFit(text), fitBlueprintLookup(catalog), options);
}

export function fitImportGroupName(
  preview: FitToBuildPlansResult,
  labels: { withHull: (fit: string, ship: string) => string; untitled: string }
): string {
  const ship = preview.hull?.productName ?? null;
  if (preview.groupName && ship) return labels.withHull(preview.groupName, ship);
  return preview.groupName ?? ship ?? labels.untitled;
}

export interface FitImportPlanContext {
  characterId: number;
  catalog: BlueprintCatalog;
  ownedBlueprints: readonly CharacterBlueprint[];
  defaultsFrom: BuildPlanRecord | null;
  facilityDefaults: ActivityFacilityDefaults;
  assumedMe: number;
  assumedTe: number;
  buildGroupId: string;
}

function entryFor(
  catalog: BlueprintCatalog,
  candidate: FitBuildCandidate
): BlueprintCatalogEntry | null {
  return catalog.byBlueprintTypeID.get(candidate.blueprintTypeID) ?? null;
}

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

export interface FitImportApplyContext extends Omit<FitImportPlanContext, 'buildGroupId'> {
  buildGroups: BuildGroupsValue;
  setBuildGroups: (value: BuildGroupsValue) => Promise<void>;
  groupName: string;
}

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
  await createBuildPlans(newPlans);
  return { groupId: buildGroupId };
}
