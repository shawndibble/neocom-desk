/**
 * The one write seam for local Build Plan changes (issue #1247).
 *
 * Every pilot-initiated change to a Build Plan goes through here: create,
 * duplicate, patch, patch sourcing, move between groups, remove. Each
 * operation owns its whole side-effect set — the Dexie transaction, the
 * `updatedAt` bump, and exactly one `scheduleSync` (removal delegates the
 * tombstone and its sync to `sync`'s `markBuildPlanDeleted`) — because
 * sync pulls on `updatedAt > cursor` (`sync/planSync.ts`), so a hand-written
 * write that forgets the bump is an edit that never reaches other devices.
 *
 * Deliberately *not* routed through here: writes that apply remote state or
 * purge in bulk (`sync/merge.ts`, `sync/characterPurge.ts`, `backup/io.ts`,
 * `character/removeCharacter.ts`). Those must not bump `updatedAt` or schedule
 * a sync — doing so would push the pulled data straight back out.
 *
 * Patch semantics everywhere: a member set to `undefined` removes that key
 * from the record rather than storing `undefined` — Firestore rejects
 * `undefined` at any depth, so an absent key is the one shape both stores
 * agree on.
 */
import { db, type BuildPlanRecord } from '@/db';
import { markBuildPlanDeleted, scheduleSync } from '@/sync';
import type { MaterialSourcing } from '@/engine/industry/types';
import { applySourcingPatch } from './sourcingEdits';

/** Any Build Plan field a patch may change — never its identity or owner. */
export type BuildPlanFields = Partial<Omit<BuildPlanRecord, 'id' | 'characterId' | 'updatedAt'>>;

/** One material's sourcing edit. */
export interface SourcingPatchEntry {
  typeID: number;
  patch: MaterialSourcing;
}

/**
 * Everything a plan's own page can do to it, as one value — so a view needs
 * one callback, not one per kind of write.
 *
 * - `edit`: the pilot changed fields. Bumps `updatedAt`.
 * - `derived`: a correction the view derived rather than the pilot made (a
 *   security band brought back into line with the build system). Persisted
 *   without bumping `updatedAt`, so merely opening a plan never counts as an
 *   edit.
 * - `sourcing`: one or more material rows' sourcing edits. Merged into the
 *   stored nested map inside the transaction, never into the map the view
 *   last rendered — merging into a stale map would drop the edit just before
 *   it (tabbing from a row's owned quantity into its override price).
 */
export type BuildPlanChange =
  | { kind: 'edit'; patch: BuildPlanFields }
  | { kind: 'derived'; patch: BuildPlanFields }
  | { kind: 'sourcing'; edits: readonly SourcingPatchEntry[] };

/** `plan` with `patch` applied; bumps `updatedAt` only when one is given. */
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
  for (const characterId of new Set(plans.map((p) => p.characterId))) scheduleSync(characterId);
}

/** Adds new plans in one write. One sync per owning Character, not one per plan. */
export async function createBuildPlans(plans: readonly BuildPlanRecord[]): Promise<void> {
  if (plans.length === 0) return;
  await db.buildPlans.bulkAdd([...plans]);
  syncOwnersOf(plans);
}

/** Copies `source` under a new id and `name`; returns the copy's id. */
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

/**
 * Applies one change to one stored plan — a read-modify-write inside the
 * transaction, never a whole-record put built on a render's closure (that
 * reverts every field the caller didn't mention). A plan deleted mid-edit is
 * a no-op, not a resurrection.
 */
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

/**
 * Patches several stored plans in one transaction — a Retarget, a group
 * Auto Build. `patch` is either one patch for all of them or a per-plan
 * function; returning `null` leaves that plan untouched. Every written plan
 * shares one `updatedAt`.
 */
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

/** Moves one plan into a group, or out of every group when `groupId` is null. */
export async function moveBuildPlan(planId: string, groupId: string | null): Promise<void> {
  await applyBuildPlanChange(planId, {
    kind: 'edit',
    patch: { buildGroupId: groupId ?? undefined },
  });
}

/**
 * Deletes a plan and records its tombstone, so the deletion propagates on the
 * next sync instead of the plan resurrecting from the remote copy.
 * `markBuildPlanDeleted` schedules that sync itself.
 */
export async function removeBuildPlan(characterId: number, planId: string): Promise<void> {
  await markBuildPlanDeleted(characterId, planId);
}
