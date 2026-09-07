/**
 * What produces a material — the bridge between the SDE payloads (the
 * blueprint catalog, pi.json) and the pure make-or-buy engine, which takes
 * recipes as plain data and knows nothing about either.
 *
 * A material is manufactured (some blueprint lists it as a product), grown on
 * a planet (a schematic produces it), or neither — a mineral, an ice product,
 * a raw P0 resource. The three are mutually exclusive in the SDE.
 */
import type { IndustryBlueprint, QuantityEntry } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { MAX_SUB_BUILD_DEPTH } from '@/engine/industry/materialResolution';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { toIndustryBlueprint, type BlueprintCatalog } from './blueprintCatalog';
import { findOwnedBlueprint } from './data';

/** The SDE half of a recipe lookup: what produces a type, before anything character-specific. */
export interface RecipeCatalog {
  catalog: BlueprintCatalog;
  /** Null while pi.json is still loading, or if it failed — planetary rows then get no verdict rather than a wrong one. */
  pi: PiData | null;
}

export interface RecipeSources extends RecipeCatalog {
  /** Sets the ME a hypothetical sub-job would run at. */
  ownedBlueprints: readonly CharacterBlueprint[];
  /**
   * ME to quote a sub-job at when the character owns no copy of its blueprint.
   * Optional, defaulting to 0 — unresearched, which is what this was before it
   * became settable, so an omitted value changes no existing number.
   *
   * An owned copy always wins: this fills the gap where there is nothing to
   * read, it never overrides a real ME in either direction.
   */
  assumedMeForUnowned?: number;
}

/** ME is 0..10 in the engine, which range-checks it and throws outside that. */
function clampMe(me: number): number {
  return Math.min(10, Math.max(0, Math.round(me)));
}

/** What a recipe consumes, or null when nothing produces the type. Independent of ME, which changes quantities but never the input list. */
function recipeInputs(typeID: number, sources: RecipeCatalog): readonly QuantityEntry[] | null {
  const entry = sources.catalog.byProductTypeID.get(typeID);
  if (entry) return entry.blueprint.materials;
  const schematic = sources.pi?.schematics[String(typeID)];
  return schematic ? schematic.inputs : null;
}

/**
 * ME the sub-job is quoted at: the best copy the character actually owns,
 * else the assumed ME. Same rule as the ME field's "Owned" hint, so the number
 * behind a row's verdict is one the page already shows somewhere.
 *
 * The unowned case used to be a hard 0, which quoted every recursive sub-build
 * in a multi-level plan as unresearched with no way to say otherwise — the
 * top-level plan's ME is an editable field, but an intermediate's was not
 * reachable from anywhere, so a plan understated its own profitability at
 * every level below the first and said nothing about it.
 */
function materialEfficiencyFor(
  blueprintTypeID: number,
  ownedBlueprints: readonly CharacterBlueprint[],
  assumedMeForUnowned: number
): number {
  const owned = findOwnedBlueprint(ownedBlueprints, blueprintTypeID);
  // Clamped, not trusted, on both paths: ESI can carry a nonsense ME and the
  // assumed value arrives from a stored preference.
  return clampMe(owned ? owned.material_efficiency : assumedMeForUnowned);
}

/** The recipe for one material, or null when nothing in the SDE produces it. */
export function materialRecipe(typeID: number, sources: RecipeSources): MaterialRecipe | null {
  const entry = sources.catalog.byProductTypeID.get(typeID);
  if (entry) {
    // A reaction formula (issue #460) shares the catalog with manufacturing
    // blueprints, but has no ME — unlike a blueprint, no owned-copy lookup
    // applies to it.
    if (entry.blueprint.activity === 'reaction') {
      return { method: 'reaction', blueprint: toIndustryBlueprint(entry.blueprint) };
    }
    return {
      method: 'manufacturing',
      blueprint: toIndustryBlueprint(entry.blueprint),
      me: materialEfficiencyFor(
        entry.blueprintTypeID,
        sources.ownedBlueprints,
        sources.assumedMeForUnowned ?? 0
      ),
    };
  }
  const schematic = sources.pi?.schematics[String(typeID)];
  if (schematic) {
    return {
      method: 'planetary',
      outputQuantity: schematic.quantity,
      inputs: schematic.inputs.map(({ typeID: id, quantity }) => ({ typeID: id, quantity })),
    };
  }
  return null;
}

/**
 * Every typeID a make-or-buy verdict needs a hub price for: the materials
 * themselves plus, one level down, whatever their recipes consume. The Build
 * Plan's price fetch is one batched call, so widening it here costs nothing
 * beyond a longer id list.
 */
export function recipeInputTypeIds(typeIDs: readonly number[], sources: RecipeCatalog): number[] {
  const ids = new Set<number>();
  for (const typeID of typeIDs) {
    for (const input of recipeInputs(typeID, sources) ?? []) ids.add(input.typeID);
  }
  return [...ids];
}

/**
 * Every typeID a Build Plan's own price fetch needs: the blueprint's
 * materials, its product, and every recipe input reachable beneath them, at
 * whatever depth. Shared by `BuildPlanDetail.tsx` (the currently-open plan)
 * and `useComparedBuildResults.ts` (issue #453 — every compared plan needs
 * this same widening against its own blueprint) so the two never drift apart.
 *
 * Walks the whole reachable tree rather than a fixed number of hops. A
 * `buildHere` choice can now sit at any depth (docs/context/decisions, since
 * the one-level cap this used to assume was lifted), and pricing each one's
 * own recipe inputs — both for its make-or-buy marker and for the resolved
 * cost `buildVsBuy` rolls up — needs a hub price at every level the tree
 * actually reaches. `MAX_SUB_BUILD_DEPTH` bounds the walk purely as a safety
 * valve against a pathological or self-referencing blueprint, matching the
 * same bound the resolver itself uses — real recipe chains bottom out long
 * before it.
 */
export function buildPlanTypeIds(blueprint: IndustryBlueprint, sources: RecipeCatalog): number[] {
  const ids = new Set(blueprint.materials.map((m) => m.typeID));
  const product = blueprint.products[0];
  if (product) ids.add(product.typeID);

  let frontier = [...ids];
  for (let depth = 0; depth < MAX_SUB_BUILD_DEPTH && frontier.length > 0; depth++) {
    const next = recipeInputTypeIds(frontier, sources).filter((id) => !ids.has(id));
    for (const id of next) ids.add(id);
    frontier = next;
  }
  return [...ids];
}
