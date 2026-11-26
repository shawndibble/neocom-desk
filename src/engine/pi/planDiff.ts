import { byNumericId } from '../compare';
import type { GoalPlan, PlannerColony } from './goalTypes';
import type { PinCounts } from './types';

export type ColonyChange =
  | { verb: 'keep'; planetId: number; p0TypeIds: number[]; notNeeded?: true }
  | { verb: 'add-extractor'; planetId: number; keep: number[]; add: number[] }
  | { verb: 'retarget'; planetId: number; from: number[]; to: number[] }
  | { verb: 'convert-to-factory'; planetId: number; from: number[]; factories: PinCounts }
  | { verb: 'idle'; planetId: number; from: number[] };

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort(byNumericId);
}

export function planDiff(plan: GoalPlan, colonies: readonly PlannerColony[]): ColonyChange[] {
  const byId = new Map(colonies.map((c) => [c.planetId, c]));
  return [...plan.assignments]
    .sort((a, b) => a.planetId - b.planetId)
    .map((assignment): ColonyChange => {
      const { planetId } = assignment;
      const colony = byId.get(planetId);
      if (!colony)
        throw new Error(`the plan assigns planet ${planetId}, which is not among the colonies`);
      const from = sortedUnique(colony.current.p0TypeIds);

      if (assignment.role === 'factory') {
        return { verb: 'convert-to-factory', planetId, from, factories: assignment.factories };
      }
      if (assignment.role === 'idle') return { verb: 'idle', planetId, from };
      if (assignment.role === 'baseline') {
        return { verb: 'keep', planetId, p0TypeIds: from, notNeeded: true };
      }

      const to = sortedUnique(assignment.slots.map((s) => s.p0TypeId));
      const toSet = new Set(to);
      const fromSet = new Set(from);
      const kept = from.filter((id) => toSet.has(id));
      if (kept.length === from.length && from.length === to.length) {
        return { verb: 'keep', planetId, p0TypeIds: to };
      }
      if (from.length > 0 && kept.length === from.length) {
        return {
          verb: 'add-extractor',
          planetId,
          keep: from,
          add: to.filter((id) => !fromSet.has(id)),
        };
      }
      return { verb: 'retarget', planetId, from, to };
    });
}
