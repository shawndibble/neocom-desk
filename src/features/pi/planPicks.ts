/**
 * Plan's top picks (#1 to #3), as one selector so Plan and the Map read the
 * same list: the Map's "Your picks" strip is this function over the same
 * `buildPlanAdvice` output, never a second ranking.
 *
 * - With colonies: each colony whose rebuild is a change, grouped by the
 *   product it should make, the group's gains summed (a product two planets
 *   should make is one pick), biggest first. A gain is ISK a day against
 *   today after quick wins.
 * - With no colonies built: the best one-planet recipes, the figure being what
 *   one planet earns a day.
 * - With colonies that already make their best product: nothing to pick.
 *
 * Picks come from the pilot's own colonies and sell market only. A what-if
 * planet changes the recipe list's reference products, not the picks.
 */
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiTier } from '@/engine/pi/types';
import type { PlanAdvice } from './planAdviceModel';

export const PLAN_PICK_COUNT = 3;

export interface PlanPick {
  typeId: number;
  name: string;
  tier: PiTier;
  /** ISK a day: the gain against today for a rebuild, what one planet earns for a recipe. */
  perDay: number;
  /** The colonies that should make it; empty for a recipe. */
  planetIds: number[];
  planetTypes: PlanetType[];
}

export interface PlanPicks {
  /** `rebuild`: gains over today. `recipes`: no colonies yet. `none`: already at their best. */
  kind: 'rebuild' | 'recipes' | 'none';
  picks: PlanPick[];
}

export function planPicks(advice: PlanAdvice): PlanPicks {
  const groups = new Map<number, PlanPick>();
  for (const colony of advice.colonies) {
    if (colony.rebuild.status !== 'change') continue;
    const { pick, gainPerDay } = colony.rebuild;
    const group = groups.get(pick.typeId) ?? {
      typeId: pick.typeId,
      name: pick.name,
      tier: pick.tier,
      perDay: 0,
      planetIds: [],
      planetTypes: [],
    };
    group.perDay += gainPerDay;
    group.planetIds.push(colony.planetId);
    if (!group.planetTypes.includes(colony.planetType)) group.planetTypes.push(colony.planetType);
    groups.set(pick.typeId, group);
  }
  if (groups.size > 0) {
    const picks = [...groups.values()]
      .sort((a, b) => b.perDay - a.perDay || a.typeId - b.typeId)
      .slice(0, PLAN_PICK_COUNT);
    return { kind: 'rebuild', picks };
  }
  if (advice.colonies.length > 0) return { kind: 'none', picks: [] };
  return {
    kind: 'recipes',
    picks: advice.recipes.recipes.slice(0, PLAN_PICK_COUNT).map((recipe) => ({
      typeId: recipe.typeId,
      name: recipe.name,
      tier: recipe.tier,
      perDay: recipe.iskPerDay,
      planetIds: [],
      planetTypes: [recipe.useType],
    })),
  };
}
