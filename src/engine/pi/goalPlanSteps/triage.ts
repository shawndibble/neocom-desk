/**
 * Step 1 of `planGoals`: normalise the goals, then set aside those a
 * **type gap** blocks before anything is assigned. Step numbers follow the module header of `../goalPlan.ts`.
 */
import type { PiData } from '@/sde/types';
import { isP0 } from '../chain';
import type { Goal, PlannerColony, PlannerPolicy, Shortfall } from '../goalTypes';
import { madeNodes, rawOf, schematicOf } from './shared';

/** Goals merged by type, zero-rate goals dropped, P0 goals refused. */
export function normaliseGoals(goals: readonly Goal[], pi: PiData): Goal[] {
  const merged = new Map<number, number>();
  for (const g of goals) {
    if (!Number.isFinite(g.unitsPerDay) || g.unitsPerDay < 0) {
      throw new Error(`a goal needs a finite, non-negative rate, got ${g.unitsPerDay}`);
    }
    if (g.unitsPerDay === 0) continue;
    if (isP0(g.typeId, pi)) {
      // Every extraction slot refines on the spot; raw P0 is never a product.
      throw new Error(`goal ${g.typeId} is a P0; the planner plans P1 and above`);
    }
    merged.set(g.typeId, (merged.get(g.typeId) ?? 0) + g.unitsPerDay);
  }
  return [...merged]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerDay]) => ({ typeId, unitsPerDay }));
}

export interface GoalTriage {
  /** Goals nothing rules out up front. */
  live: Goal[];
  /** Goals a type gap blocks: they make nothing, so nothing is extracted for them. */
  blocked: Goal[];
  /** Per blocked goal, the P0s whose type gaps block it, ascending. */
  blockedBy: Map<Goal, number[]>;
  typeGaps: Shortfall[];
}

/**
 * Which goals can be planned at all. A P1 whose P0 no enabled colony's planet
 * type yields, and that the pilot will not buy, blocks every goal whose chain
 * needs it — a **type gap**. Those goals are dropped before anything is
 * assigned: nothing extracts for a product that cannot be finished, and no
 * budget gap is reported for its other inputs (fix the type gap first; they
 * reappear in the plan once it is fixed).
 */
export function triageGoals(
  goals: readonly Goal[],
  colonies: readonly PlannerColony[],
  policy: PlannerPolicy,
  pi: PiData
): GoalTriage {
  const buyP1 = policy.buyTiers.includes(1);
  const yieldable = (p0: number) => colonies.some((c) => c.ratePerEcu.has(p0));
  const gapUnits = new Map<number, number>(); // p1 → P1 units/h the blocked goals wanted
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
