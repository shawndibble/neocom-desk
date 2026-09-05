/**
 * Applies a Build Plan's chosen sub-builds to its materials: the rows the
 * player asked to build are replaced by what those jobs consume, and the
 * result is priced and sourced exactly like the plan's own materials.
 *
 * The plan side of `src/engine/industry/subBuild`, in the same relationship
 * `computeBuildPlan` has to `buildVsBuy` — it reads the record's fields and
 * takes the recipe lookup as a function, so nothing here knows about the
 * blueprint catalog or pi.json.
 *
 * Manufacturing only. A planetary material is left as a row to buy even when
 * the plan lists it: its inputs are grown on a colony over days, not installed
 * as a job, so swapping a market-listed commodity for planet goo would turn a
 * shopping list into something no market sells (docs/context/decisions).
 */

import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import type { MaterialRecipe } from '@/engine/industry/makeOrBuy';
import { materialCostLines } from '@/engine/industry/sourcing';
import {
  mergeSubBuildMaterials,
  planSubBuild,
  subBuildFeeTotal,
  type SubBuild,
  type SubBuildContext,
} from '@/engine/industry/subBuild';

export interface ExpandBuildPlanInput {
  /** The plan's own cost lines, already netted against its owned stock. */
  materials: readonly MaterialCostLine[];
  /** Material typeIDs the player chose to build rather than buy. */
  buildHere: readonly number[];
  recipeFor: (typeID: number) => MaterialRecipe | null;
  hubPrices: HubPrices;
  sourcing: MaterialSourcingMap | undefined;
  ctx: SubBuildContext;
}

export interface ExpandedBuildPlan {
  /** Planned sub-jobs by the material each one produces. Empty when nothing expanded. */
  subBuilds: Map<number, SubBuild>;
  /** What the plan now has to acquire: unexpanded materials plus merged recipe inputs. */
  materials: MaterialCostLine[];
  /** Sum of those lines' costs — owned units free, unpriced ones excluded. */
  materialCost: number;
  /** Every sub-job's installation fee. A real cost of building rather than buying. */
  subBuildFees: number;
}

/** One row of the materials table once sub-builds are in play. */
export interface MaterialTableRow extends MaterialCostLine {
  /**
   * The job that will produce this material. Present only on a row the player
   * chose to build: the row stays visible so the choice can be seen and undone,
   * but it is no longer something to buy.
   */
  subBuild?: SubBuild;
  /**
   * True on a row that exists only because something above it is being built.
   * Indented in the table — it is an input to a job, not a blueprint material.
   */
  isSubInput?: boolean;
}

/**
 * The materials table's rows: the plan's own materials in their original
 * order, then whatever the sub-jobs added.
 *
 * An expanded material keeps its row rather than vanishing — it is still being
 * acquired, just by a job instead of a purchase, and a row that disappeared on
 * click would leave nothing to click again to undo it.
 *
 * A recipe input is listed once, not once per parent, because it is bought
 * once: three components that each consume the same fibre are one order. When
 * the plan already buys that input directly, the swapped-in units simply join
 * that existing row instead of starting an indented one.
 *
 * An expanded row deliberately carries its own unmerged line rather than the
 * merged one. It is excluded from the merge — its quantity is what the job
 * produces, not something being bought — so reaching for the merged line here
 * would find nothing, or, if a later change ever let a material be both built
 * and an input to another build, would show it a quantity it is not making.
 */
export function subBuildTableRows(
  materials: readonly MaterialCostLine[],
  expanded: ExpandedBuildPlan
): MaterialTableRow[] {
  const mergedByType = new Map(expanded.materials.map((m) => [m.typeID, m]));
  const own = new Set(materials.map((m) => m.typeID));

  const rows: MaterialTableRow[] = materials.map((material) => {
    const sub = expanded.subBuilds.get(material.typeID);
    if (sub) return { ...material, subBuild: sub };
    return { ...(mergedByType.get(material.typeID) ?? material) };
  });

  for (const merged of expanded.materials) {
    if (!own.has(merged.typeID)) rows.push({ ...merged, isSubInput: true });
  }

  return rows;
}

export function expandBuildPlan({
  materials,
  buildHere,
  recipeFor,
  hubPrices,
  sourcing,
  ctx,
}: ExpandBuildPlanInput): ExpandedBuildPlan {
  const subBuilds = new Map<number, SubBuild>();
  const chosen = new Set(buildHere);

  for (const material of materials) {
    if (!chosen.has(material.typeID)) continue;
    const recipe = recipeFor(material.typeID);
    if (recipe?.method !== 'manufacturing') continue;
    const sub = planSubBuild(material, recipe.blueprint, recipe.me, ctx);
    if (sub) subBuilds.set(material.typeID, sub);
  }

  // Re-priced from scratch rather than patched: a merged input can be part
  // bought directly and part swapped in, and only one pass over the combined
  // quantity applies the owned-stock clamp to the total the plan really needs.
  const merged = materialCostLines(
    mergeSubBuildMaterials(materials, subBuilds),
    hubPrices,
    sourcing
  );

  return {
    subBuilds,
    materials: merged,
    materialCost: merged.reduce((sum, { lineCost }) => sum + lineCost, 0),
    subBuildFees: subBuildFeeTotal(subBuilds),
  };
}
