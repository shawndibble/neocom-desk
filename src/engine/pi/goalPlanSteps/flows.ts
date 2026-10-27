/**
 * The plan's ledger: every leg goods move on as a `Flow`, and what is read off
 * it — surplus, buys and hauling. Routing rules are in the module header of
 * `../goalPlan.ts` ("Flows are the ledger").
 */
import type { PiData } from '@/sde/types';
import { piTier } from '../chain';
import type {
  ColonyAssignment,
  ExtractionSlot,
  Flow,
  FlowEnd,
  Goal,
  GoalPlan,
  JumpsFn,
  PlannerColony,
} from '../goalTypes';
import { legJumps, volumeOf } from '../haulEffort';
import { hostFirstOrder, slotP1, type ExtractionProblem, type Wants } from './extraction';
import { EPSILON, HOURS_PER_DAY, HOURS_PER_WEEK, chainRates, perHour } from './shared';

export function planFlows(args: {
  problem: ExtractionProblem;
  wants: Wants;
  /** The settled host (`settleHost`), or null. */
  host: PlannerColony | null;
  /** P1/P2+ units/h the host consumes. */
  hostUse: ReadonlyMap<number, number>;
  bought: ReadonlyMap<number, number>;
  highAchieved: readonly Goal[];
  boughtOutright: ReadonlySet<Goal>;
  spare: ReadonlyMap<number, ExtractionSlot>;
  assignments: readonly ColonyAssignment[];
  jumps: JumpsFn | undefined;
  pi: PiData;
}): Flow[] {
  const { problem, wants, host, hostUse, bought, highAchieved, boughtOutright, jumps, pi } = args;
  const tierOf = (id: number) => piTier(id, pi);
  const flows: Flow[] = [];
  const push = (from: FlowEnd, to: FlowEnd, typeId: number, unitsPerHour: number) => {
    if (unitsPerHour <= EPSILON) return;
    const leg: Flow = { from, to, typeId, tier: tierOf(typeId), unitsPerHour };
    if (jumps) leg.jumps = legJumps(from, to, jumps);
    flows.push(leg);
  };
  const hostLeft = new Map([...hostUse].filter(([id]) => tierOf(id) === 1));
  // The host feeds itself before anyone ships it anything. Spare slots are
  // not the plan's own extraction: they go straight to the hub below.
  for (const c of hostFirstOrder(problem.colonies, host)) {
    for (const w of wants.get(c.planetId) ?? []) {
      const p1 = problem.rowByP0.get(w.p0TypeId)!.p1;
      const units = slotP1(problem, c, w.p0TypeId, w.ecus);
      const toHost = host ? Math.min(units, hostLeft.get(p1) ?? 0) : 0;
      if (host) push(c.planetId, host.planetId, p1, toHost);
      hostLeft.set(p1, (hostLeft.get(p1) ?? 0) - toHost);
      push(c.planetId, 'hub', p1, units - toHost);
    }
  }
  for (const [p1, units] of [...bought].sort(([a], [b]) => a - b)) {
    const toHost = Math.min(units, Math.max(0, hostLeft.get(p1) ?? 0));
    if (host) push('hub', host.planetId, p1, toHost);
    push('hub', 'hub', p1, units - toHost);
  }
  if (host)
    for (const a of highAchieved) {
      // A goal's own type may be partly bought (`Goal.buyShare`): only the
      // made part leaves the host.
      push(
        host.planetId,
        'hub',
        a.typeId,
        (a.unitsPerDay / HOURS_PER_DAY) * (1 - (a.buyShare?.get(a.typeId) ?? 0))
      );
      // P2/P3 bought for the chain land on the host, in proportion to what it makes.
      for (const [typeId, units] of [...chainRates(a, pi).bought].sort(([x], [y]) => x - y)) {
        if (typeId !== a.typeId) push('hub', host.planetId, typeId, units);
      }
    }
  for (const g of problem.plannedHigh) {
    const share = g.buyShare?.get(g.typeId) ?? 0;
    if (share > 0) push('hub', 'hub', g.typeId, perHour(g) * share);
  }
  for (const g of boughtOutright) push('hub', 'hub', g.typeId, perHour(g));
  // What the plan leaves alone sells: spare slots and whole Baseline colonies.
  for (const [planetId, slot] of args.spare) push(planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  for (const a of args.assignments) {
    if (a.role !== 'baseline') continue;
    for (const slot of a.slots) push(a.planetId, 'hub', slot.p1TypeId, slot.p1PerHour);
  }
  return flows;
}

/** Extracted P1 beyond what the host and the P1 goals consume: whole-ECU overshoot, sold. */
export function surplusOf(
  extracted: ReadonlyMap<number, number>,
  hostUse: ReadonlyMap<number, number>,
  p1GoalReach: ReadonlyMap<number, number>
): GoalPlan['surplusP1'] {
  const surplusP1: GoalPlan['surplusP1'] = [];
  for (const [p1, units] of [...extracted].sort(([a], [b]) => a - b)) {
    const surplus = units - (hostUse.get(p1) ?? 0) - (p1GoalReach.get(p1) ?? 0);
    if (surplus > EPSILON) surplusP1.push({ typeId: p1, unitsPerHour: surplus });
  }
  return surplusP1;
}

/** Everything leaving the hub, summed per type. */
export function buysOf(flows: readonly Flow[], pi: PiData): GoalPlan['buys'] {
  const buysByType = new Map<number, number>();
  for (const f of flows) {
    if (f.from === 'hub')
      buysByType.set(f.typeId, (buysByType.get(f.typeId) ?? 0) + f.unitsPerHour);
  }
  return [...buysByType]
    .sort(([a], [b]) => a - b)
    .map(([typeId, unitsPerHour]) => ({ typeId, tier: piTier(typeId, pi), unitsPerHour }));
}

/** m3 a week over every leg between two places, in total and per colony end. */
export function haulingOf(flows: readonly Flow[], pi: PiData): GoalPlan['hauling'] {
  // Hub-to-hub (bought and kept) and host-to-itself legs move nothing between places.
  let m3PerWeek = 0;
  const perColony = new Map<number, number>();
  for (const f of flows) {
    if (f.from === f.to) continue;
    const m3 = f.unitsPerHour * volumeOf(f.typeId, pi) * HOURS_PER_WEEK;
    m3PerWeek += m3;
    for (const end of [f.from, f.to]) {
      if (end !== 'hub') perColony.set(end, (perColony.get(end) ?? 0) + m3);
    }
  }
  return { m3PerWeek, perColony };
}
