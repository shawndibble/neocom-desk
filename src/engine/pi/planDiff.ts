/**
 * A Goal Plan as a change list against what each colony runs today — never a
 * fresh layout.
 *
 * The Goal Plan is the opt-in what-if that may re-plan extraction (ADR 0012
 * keeps the Advisor from doing so), and the scope decision makes the honest
 * form of that a list of moves the pilot can check one colony at a time:
 * "re-target Uttindar V from Reactive Gas to Base Metals". So each colony gets
 * exactly one verb:
 *
 * - `keep` — the plan extracts the same P0 set it does now. ECU counts are
 *   not compared: `PlannerColony.current` carries the P0s, not the programs.
 * - `add-extractor` — today's P0s all stay and the plan adds another beside
 *   them. Distinct from `retarget` because nothing is torn down.
 * - `retarget` — anything else on an extractor, including a colony that
 *   extracts nothing today (`from: []`).
 * - `convert-to-factory` — the factory host, naming the extraction it gives
 *   up and the factory pins it gains.
 * - `idle` — the plan has no role for it.
 *
 * P0 lists are sorted so a reordering is never reported as a change.
 *
 * Pure: plan and colonies are parameters.
 */

import type { GoalPlan, PlannerColony } from './goalTypes';
import type { PinCounts } from './types';

export type ColonyChange =
  | { verb: 'keep'; planetId: number; p0TypeIds: number[] }
  | { verb: 'add-extractor'; planetId: number; keep: number[]; add: number[] }
  | { verb: 'retarget'; planetId: number; from: number[]; to: number[] }
  | { verb: 'convert-to-factory'; planetId: number; from: number[]; factories: PinCounts }
  | { verb: 'idle'; planetId: number; from: number[] };

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** One change per assignment, by planet id. */
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

      const to = sortedUnique(assignment.slots.map((s) => s.p0TypeId));
      const kept = from.filter((id) => to.includes(id));
      if (kept.length === from.length && from.length === to.length) {
        return { verb: 'keep', planetId, p0TypeIds: to };
      }
      if (from.length > 0 && kept.length === from.length) {
        return {
          verb: 'add-extractor',
          planetId,
          keep: from,
          add: to.filter((id) => !from.includes(id)),
        };
      }
      return { verb: 'retarget', planetId, from, to };
    });
}
