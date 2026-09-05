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
 * else unresearched. Same rule as the ME field's "Owned" hint, so the number
 * behind a row's verdict is one the page already shows somewhere.
 */
function ownedMaterialEfficiency(
  blueprintTypeID: number,
  ownedBlueprints: readonly CharacterBlueprint[]
): number {
  const owned = findOwnedBlueprint(ownedBlueprints, blueprintTypeID);
  if (!owned) return 0;
  // Clamped, not trusted: the engine range-checks ME and would throw on a
  // value outside 0..10.
  return Math.min(10, Math.max(0, Math.round(owned.material_efficiency)));
}

/** The recipe for one material, or null when nothing in the SDE produces it. */
export function materialRecipe(typeID: number, sources: RecipeSources): MaterialRecipe | null {
  const entry = sources.catalog.byProductTypeID.get(typeID);
  if (entry) {
    return {
      method: 'manufacturing',
      blueprint: toIndustryBlueprint(entry.blueprint),
      me: ownedMaterialEfficiency(entry.blueprintTypeID, sources.ownedBlueprints),
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
 * materials, its product, and (via `recipeInputTypeIds`, applied twice) two
 * levels of their own recipe inputs. Shared by `BuildPlanDetail.tsx` (the
 * currently-open plan) and `useComparedBuildResults.ts` (issue #453 — every
 * compared plan needs this same widening against its own blueprint) so the
 * two never drift apart.
 *
 * Two levels, not one. The first prices the materials table's own make-or-buy
 * marker — is this material worth building, given what its recipe costs in
 * inputs. Once the player acts on that and the plan expands a material into
 * its inputs (one level deep, docs/context/decisions), those inputs get the
 * same marker, and answering *that* verdict needs pricing for one level
 * further down still — an expanded row's own recipe inputs. Nothing goes
 * three levels deep: sub-builds themselves stop at one, so there is never a
 * make-or-buy question to answer beyond what two levels of widening prices.
 */
export function buildPlanTypeIds(blueprint: IndustryBlueprint, sources: RecipeCatalog): number[] {
  const ids = new Set(blueprint.materials.map((m) => m.typeID));
  const product = blueprint.products[0];
  if (product) ids.add(product.typeID);
  const firstLevel = recipeInputTypeIds([...ids], sources);
  for (const id of firstLevel) ids.add(id);
  for (const id of recipeInputTypeIds(firstLevel, sources)) ids.add(id);
  return [...ids];
}
