/**
 * Which planetary commodities the chain planner can be pointed at.
 *
 * One list, two callers: `PlanPanel`'s product picker and the item context
 * menu's "PI Plan" action. They must agree exactly, because `PlanPanel`
 * resolves an unrecognised `?type=` by silently falling back to another
 * commodity — a menu entry offered on a type the picker doesn't hold would
 * plan the wrong item rather than fail. Deriving both from `productOptions`
 * is what makes that impossible.
 *
 * Membership is the graph's answer, not a table: a schematic whose tier
 * `piTier` refuses to resolve (a cycle, or a depth the game doesn't define)
 * is dropped rather than offered. P0 is absent by construction — raw
 * resources are extracted, and there is no schematic that makes one.
 */
import { piTier } from '@/engine/pi/chain';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';

export interface ProductOption {
  typeId: number;
  name: string;
  tier: 1 | 2 | 3 | 4;
}

/** Every commodity `pi.json` has a schematic for, tiered off the graph rather than a table. */
export function productOptions(pi: PiData): ProductOption[] {
  const options: ProductOption[] = [];
  for (const [key, schematic] of Object.entries(pi.schematics)) {
    const typeId = Number(key);
    let tier: number;
    try {
      tier = piTier(typeId, pi);
    } catch {
      continue;
    }
    if (tier < 1 || tier > 4) continue;
    options.push({ typeId, name: schematic.name, tier: tier as 1 | 2 | 3 | 4 });
  }
  return options.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

/** The same set, by typeID — "can the planner plan this item" in one lookup. */
export function plannableTypeIds(pi: PiData): Set<number> {
  return new Set(productOptions(pi).map((option) => option.typeId));
}

/**
 * `plannableTypeIds` over the cached `pi.json`, memoized twice over: the
 * payload by `loadSde`'s own cache, the derived set here, because the item
 * context menu asks this question from every row of a market tree.
 *
 * `peek` exists so a component mounting after the first load answers
 * synchronously and never re-renders for it.
 */
let resolvedIds: ReadonlySet<number> | null = null;
let inFlight: Promise<ReadonlySet<number>> | null = null;

export function loadPlannableTypeIds(): Promise<ReadonlySet<number>> {
  inFlight ??= loadPi()
    .then((pi) => {
      resolvedIds = plannableTypeIds(pi);
      return resolvedIds;
    })
    .catch((err: unknown) => {
      inFlight = null; // allow retry after failure, as `loadSde`'s cache does
      throw err;
    });
  return inFlight;
}

/** The loaded set, or null while `pi.json` has never resolved. Never fetches. */
export function peekPlannableTypeIds(): ReadonlySet<number> | null {
  return resolvedIds;
}

/**
 * ESI's schematic id to the product typeID `PiData.schematics` is keyed by.
 *
 * A factory pin reports which *schematic* it runs; every question worth asking
 * about it — what it makes, what it eats, which facility runs it — is keyed by
 * the *product*. The two directions were being rebuilt independently in
 * `stopTierModel` and `factoryBalanceModel`, and a map built twice is a map
 * that can disagree with itself.
 */
export function productBySchematicId(pi: PiData): Map<number, number> {
  return new Map(
    Object.entries(pi.schematics).map(([typeId, schematic]) => [
      schematic.schematicId,
      Number(typeId),
    ])
  );
}
