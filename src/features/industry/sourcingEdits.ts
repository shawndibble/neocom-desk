/**
 * Editing side of `MaterialSourcing`: turns one row's edit into the whole
 * replacement map a Build Plan record stores.
 *
 * The map is stored on the plan record, so an edit is a read-modify-write of a
 * plain object rather than a field assignment. Two rules keep that honest:
 * merging is per-material (editing tritanium's override must not disturb the
 * owned quantity beside it, nor the entry for pyerite), and the result is run
 * through the engine's `normalizeMaterialSourcingMap` so a cleared field drops
 * its member, an emptied entry drops its key, and an emptied map collapses to
 * `undefined` — which is what lets the caller store "no overrides at all"
 * exactly the way a plan that never had any stores it.
 */

import { db } from '@/db';
import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';

/**
 * One material's sourcing edit, merged into a copy of `sourcing`.
 *
 * `patch` members set to `undefined` clear that field — the caller passes
 * `{ overridePrice: undefined }` for a cleared input, and normalization then
 * drops it. Returns `undefined` when nothing is left to store.
 */
export function applySourcingPatch(
  sourcing: MaterialSourcingMap | undefined,
  typeID: number,
  patch: MaterialSourcing
): MaterialSourcingMap | undefined {
  return normalizeMaterialSourcingMap({
    ...sourcing,
    [typeID]: { ...sourcing?.[typeID], ...patch },
  });
}

/**
 * Persists one row's edit against the stored plan.
 *
 * The merge happens inside the write transaction, reading the record rather
 * than whatever map the panel last rendered. Unlike runs/ME/TE — each a whole
 * field, so a stale base can only lose a concurrent edit to a *different*
 * field — a sourcing edit merges into a nested map, and merging into a map
 * read one render ago would drop the edit made just before it. Tabbing from a
 * row's owned quantity straight into its override price is exactly that case.
 *
 * A plan deleted mid-edit is a no-op, not a resurrection.
 */
export async function saveSourcingEdit(
  planId: string,
  typeID: number,
  patch: MaterialSourcing
): Promise<void> {
  await db.transaction('rw', db.buildPlans, async () => {
    const plan = await db.buildPlans.get(planId);
    if (!plan) return;
    await db.buildPlans.put({
      ...plan,
      materialSourcing: applySourcingPatch(plan.materialSourcing, typeID, patch),
      updatedAt: Date.now(),
    });
  });
}
