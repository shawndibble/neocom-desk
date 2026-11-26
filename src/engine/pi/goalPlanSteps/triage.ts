import type { PiData } from '@/sde/types';
import { isP0 } from '../chain';
import type { Goal, PlannerColony, PlannerPolicy, Shortfall } from '../goalTypes';
import { madeNodes, rawOf, schematicOf } from './shared';

export function normaliseGoals(goals: readonly Goal[], pi: PiData): Goal[] {
  const merged = new Map<number, number>();
  for (const g of goals) {
    if (!Number.isFinite(g.unitsPerDay) || g.unitsPerDay < 0) {
      throw new Error(`a goal needs a finite, non-negative rate, got ${g.unitsPerDay}`);
    }
    if (g.unitsPerDay === 0) continue;
    if (isP0(g.typeId, pi)) {
      throw new Error(`goal ${g.typeId} is a P0; the planner plans P1 and above`);
    }
    merged.set(g.typeId, (merged.get(g.typeId) ?? 0) + g.unitsPerDay);
  }
  return [...merged]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerDay]) => ({ typeId, unitsPerDay }));
}

export interface GoalTriage {
  live: Goal[];
  blocked: Goal[];
  blockedBy: Map<Goal, number[]>;
  typeGaps: Shortfall[];
}

export function triageGoals(
  goals: readonly Goal[],
  colonies: readonly PlannerColony[],
  policy: PlannerPolicy,
  pi: PiData
): GoalTriage {
  const buyP1 = policy.buyTiers.includes(1);
  const yieldable = (p0: number) => colonies.some((c) => c.ratePerEcu.has(p0));
  const gapUnits = new Map<number, number>();
  const live: Goal[] = [];
  const blocked: Goal[] = [];
  const blockedBy = new Map<Goal, number[]>();
  for (const g of goals) {
    const gaps = buyP1
      ? []
      : madeNodes(g, pi).filter(
          (n) => n.tier === 1 && !yieldable(schematicOf(n.typeId, pi).inputs[0].typeID)
        );
    if (gaps.length === 0) {
      live.push(g);
      continue;
    }
    blocked.push(g);
    blockedBy.set(
      g,
      [...new Set(gaps.map((n) => schematicOf(n.typeId, pi).inputs[0].typeID))].sort(
        (a, b) => a - b
      )
    );
    for (const n of gaps) gapUnits.set(n.typeId, (gapUnits.get(n.typeId) ?? 0) + n.unitsPerHour);
  }
  const typeGaps: Shortfall[] = [...gapUnits]
    .sort(([a], [b]) => a - b)
    .map(([p1TypeId, p1UnitsPerHour]) => {
      const schematic = schematicOf(p1TypeId, pi);
      const input = schematic.inputs[0];
      const raw = rawOf(input.typeID, pi);
      return {
        kind: 'type-gap',
        p0TypeId: input.typeID,
        p1TypeId,
        unitsPerHour: (p1UnitsPerHour * input.quantity) / schematic.quantity,
        p1UnitsPerHour,
        fixPlanetTypes: [...raw.planetTypes],
      };
    });
  return { live, blocked, blockedBy, typeGaps };
}
