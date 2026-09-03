/**
 * Editing side of `MaterialSourcing`: turns one row's edit into the whole
 * replacement map a Build Plan patch carries.
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

import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';

/**
 * One material's sourcing edit, merged into a copy of `sourcing`.
 *
 * `patch` members set to `undefined` clear that field — the caller passes
 * `{ overridePrice: undefined }` for a cleared input, and normalization then
 * drops it. Returns `undefined` when nothing is left to store; a caller
 * patching a plan record must pass that through explicitly
 * (`{ materialSourcing: undefined }`) rather than omitting the key, or the
 * spread that applies the patch keeps the stale map.
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
