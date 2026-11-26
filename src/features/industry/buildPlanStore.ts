import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import type { MaterialSourcing } from '@/engine/industry/types';
import { applySourcingPatch } from '@/engine/industry/sourcingEdits';
import { mostRecentlyUpdatedPlan } from './newBuildPlan';

export type BuildPlanFields = Partial<Omit<BuildPlanRecord, 'id' | 'characterId' | 'updatedAt'>>;

export interface SourcingPatchEntry {
  typeID: number;
  patch: MaterialSourcing;
}

export type BuildPlanChange =
  | { kind: 'edit'; patch: BuildPlanFields }
  | { kind: 'derived'; patch: BuildPlanFields }
  | { kind: 'sourcing'; edits: readonly SourcingPatchEntry[] };

function withPatch(
  plan: BuildPlanRecord,
  patch: BuildPlanFields,
  updatedAt?: number
): BuildPlanRecord {
  const next: BuildPlanRecord = { ...plan, ...patch };
  for (const key of Object.keys(patch) as (keyof BuildPlanFields)[]) {
    if (patch[key] === undefined) delete next[key];
  }
  if (updatedAt !== undefined) next.updatedAt = updatedAt;
  return next;
}

function syncOwnersOf(plans: readonly BuildPlanRecord[]): void {
  for (const characterId of new Set(plans.map((p) => p.characterId)))
    scheduleSync(characterId, { collections: ['buildPlans'] });
}

export async function loadLatestBuildPlan(characterId: number): Promise<BuildPlanRecord | null> {
  const plans = await db.buildPlans.where('characterId').equals(characterId).toArray();
  return mostRecentlyUpdatedPlan(plans);
}

export async function createBuildPlans(plans: readonly BuildPlanRecord[]): Promise<void> {
  if (plans.length === 0) return;
  await db.buildPlans.bulkAdd([...plans]);
  syncOwnersOf(plans);
}

export async function duplicateBuildPlan(source: BuildPlanRecord, name: string): Promise<string> {
  const copy: BuildPlanRecord = {
    ...source,
    id: crypto.randomUUID(),
    name,
    updatedAt: Date.now(),
  };
  await createBuildPlans([copy]);
  return copy.id;
}

export async function applyBuildPlanChange(planId: string, change: BuildPlanChange): Promise<void> {
  const written = await db.transaction('rw', db.buildPlans, async () => {
    const stored = await db.buildPlans.get(planId);
    if (!stored || (change.kind === 'sourcing' && change.edits.length === 0)) return null;
    let next: BuildPlanRecord;
    if (change.kind === 'sourcing') {
      let sourcing = stored.materialSourcing;
      for (const { typeID, patch } of change.edits) {
        sourcing = applySourcingPatch(sourcing, typeID, patch);
      }
      next = withPatch(stored, { materialSourcing: sourcing }, Date.now());
    } else {
      next = withPatch(stored, change.patch, change.kind === 'edit' ? Date.now() : undefined);
    }
    await db.buildPlans.put(next);
    return next;
  });
  if (written) syncOwnersOf([written]);
}

export async function patchBuildPlans(
  planIds: readonly string[],
  patch: BuildPlanFields | ((plan: BuildPlanRecord) => BuildPlanFields | null)
): Promise<void> {
  if (planIds.length === 0) return;
  const written = await db.transaction('rw', db.buildPlans, async () => {
    const stored = await db.buildPlans.bulkGet([...planIds]);
    const now = Date.now();
    const updated = stored.flatMap((plan) => {
      if (!plan) return [];
      const planPatch = typeof patch === 'function' ? patch(plan) : patch;
      return planPatch ? [withPatch(plan, planPatch, now)] : [];
    });
    if (updated.length > 0) await db.buildPlans.bulkPut(updated);
    return updated;
  });
  syncOwnersOf(written);
}

export async function moveBuildPlan(planId: string, groupId: string | null): Promise<void> {
  await applyBuildPlanChange(planId, {
    kind: 'edit',
    patch: { buildGroupId: groupId ?? undefined },
  });
}

export async function removeBuildPlan(characterId: number, planId: string): Promise<void> {
  await markBuildPlanDeleted(characterId, planId);
}
