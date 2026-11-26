import type { PlanetType } from '@/engine/pi/goalTypes';
import type { PiTier } from '@/engine/pi/types';
import type { PlanAdvice } from './planAdviceModel';

const PLAN_PICK_COUNT = 3;

export interface PlanPick {
  typeId: number;
  name: string;
  tier: PiTier;
  perDay: number;
  planetIds: number[];
  planetTypes: PlanetType[];
  needsCcLevel?: number;
}

export interface PlanPicks {
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
    picks: advice.recipesWithTagged.recipes.slice(0, PLAN_PICK_COUNT).map((recipe) => ({
      typeId: recipe.typeId,
      name: recipe.name,
      tier: recipe.tier,
      perDay: recipe.iskPerDay,
      planetIds: [],
      planetTypes: [recipe.useType],
      ...(recipe.needsCcLevel ? { needsCcLevel: recipe.needsCcLevel } : {}),
    })),
  };
}
