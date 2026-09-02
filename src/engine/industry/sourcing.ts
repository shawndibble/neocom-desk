/**
 * Material sourcing: resolves each effective material against the player's
 * per-material overrides (units already owned, manual unit price) and the hub
 * prices, producing one cost line per material.
 *
 * Rules (issue #179):
 * - The free portion is min(ownedQuantity, quantity) — an owned quantity
 *   larger than the job needs clamps silently, it is never an error.
 * - The remainder is priced at the override price if one is set, otherwise the
 *   hub price. Owned units always contribute zero cost.
 * - A material blocks the plan's pricing only when its remainder is non-zero
 *   AND neither an override nor a hub price exists — a fully owned material is
 *   never a blocker, even with no hub listing at all.
 *
 * Nothing here throws: garbage input (negative, NaN, Infinity) is treated as
 * an absent override, so computeBuildPlan's never-throws contract holds.
 */

import type {
  EffectiveMaterial,
  HubPrices,
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';

/** A usable non-negative number, or undefined. Zero is kept — it is a real price. */
function usable(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Resolve one material against its sourcing entry and the hub prices. */
export function materialCostLine(
  material: EffectiveMaterial,
  hubPrices: HubPrices,
  sourcing?: MaterialSourcing
): MaterialCostLine {
  const owned = Math.min(usable(sourcing?.ownedQuantity) ?? 0, material.quantity);
  const remainingQuantity = material.quantity - owned;
  const unitPrice = usable(sourcing?.overridePrice) ?? usable(hubPrices[material.typeID]) ?? null;
  return {
    ...material,
    ownedQuantity: owned,
    remainingQuantity,
    unitPrice,
    lineCost: unitPrice === null ? 0 : remainingQuantity * unitPrice,
    unpriced: remainingQuantity > 0 && unitPrice === null,
  };
}

/** Per-material cost lines for a whole job. Entries for unused materials are ignored. */
export function materialCostLines(
  materials: readonly EffectiveMaterial[],
  hubPrices: HubPrices,
  sourcing?: MaterialSourcingMap
): MaterialCostLine[] {
  return materials.map((material) =>
    materialCostLine(material, hubPrices, sourcing?.[material.typeID])
  );
}

/**
 * Strip absent/unusable members so a sourcing map is safe to persist and sync:
 * Firestore rejects `undefined` at any depth, so `{ overridePrice: undefined }`
 * would throw on write. Entries left carrying nothing are dropped, and an
 * empty result collapses to `undefined` so the caller omits the key entirely.
 */
export function normalizeMaterialSourcingMap(
  sourcing: MaterialSourcingMap | undefined
): MaterialSourcingMap | undefined {
  if (sourcing === undefined) return undefined;
  const normalized: MaterialSourcingMap = {};
  let kept = false;
  for (const [key, entry] of Object.entries(sourcing)) {
    const typeID = Number(key);
    const ownedQuantity = usable(entry?.ownedQuantity);
    const overridePrice = usable(entry?.overridePrice);
    if (!Number.isFinite(typeID) || (ownedQuantity === undefined && overridePrice === undefined)) {
      continue;
    }
    normalized[typeID] = {
      ...(ownedQuantity !== undefined ? { ownedQuantity } : {}),
      ...(overridePrice !== undefined ? { overridePrice } : {}),
    };
    kept = true;
  }
  return kept ? normalized : undefined;
}
