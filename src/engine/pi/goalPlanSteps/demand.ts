/**
 * The plan's demand lines and per-goal achievement: the goals as asked, each
 * line saying how much of it the final plan makes and from where.
 */
import type { PiData } from '@/sde/types';
import { piTier } from '../chain';
import type { DemandLine, DemandSource, Goal, GoalPlan } from '../goalTypes';
import type { ExtractionProblem } from './extraction';
import type { GoalTriage } from './triage';
import { EPSILON, expandInto, factoriesFor, perHour } from './shared';

export function demandLines(args: {
  problem: ExtractionProblem;
  /** Final extraction and consumption, per P1. */
  extracted: ReadonlyMap<number, number>;
  consumption: ReadonlyMap<number, number>;
  budgetGapP1: ReadonlySet<number>;
  bought: ReadonlyMap<number, number>;
  /** Every chain node the settled host actually makes, per hour. */
  madeHighRates: ReadonlyMap<number, number>;
  triage: GoalTriage;
  /** Goals that cannot be made, in the order they were ruled out. */
  dead: ReadonlySet<Goal>;
  boughtOutright: ReadonlySet<Goal>;
  pi: PiData;
}): DemandLine[] {
  const { problem, extracted, consumption, budgetGapP1, bought, madeHighRates, triage, pi } = args;
  const { dead, boughtOutright } = args;
  const tierOf = (id: number) => piTier(id, pi);
  const { demand } = problem;
  const p1Of = (p0: number) => problem.rowByP0.get(p0)!.p1;
  // Made means extracted *and used*: overshoot from a whole ECU is surplus, not made.
  const p1Made = (p1: number) => Math.min(extracted.get(p1) ?? 0, consumption.get(p1) ?? 0);
  const lines: DemandLine[] = [...demand].map(([typeId, unitsPerHour]) => {
    const tier = tierOf(typeId);
    let made: number;
    let source: DemandSource;
    if (tier === 0) {
      const p1 = p1Of(typeId);
      made = (p1Made(p1) / (demand.get(p1) ?? 1)) * unitsPerHour;
      source = budgetGapP1.has(p1)
        ? 'short'
        : (extracted.get(p1) ?? 0) <= EPSILON && bought.has(p1)
          ? 'not-extracted'
          : 'extracted';
    } else if (tier === 1) {
      made = p1Made(typeId);
      source = budgetGapP1.has(typeId) ? 'short' : bought.has(typeId) ? 'bought' : 'made';
    } else {
      made = madeHighRates.get(typeId) ?? 0;
      source = made >= unitsPerHour - EPSILON ? 'made' : 'short';
    }
    return {
      typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(typeId, unitsPerHour, pi),
      source,
      madeFraction: unitsPerHour <= EPSILON ? 1 : Math.min(1, made / unitsPerHour),
    };
  });
  // A goal a type gap blocks keeps its whole chain in the demand, so the plan
  // still answers "what would it need" — every line 'blocked', made by
  // nothing, consuming and pricing nothing. A type both a live goal and a
  // blocked one need gets two lines: (typeId, source) is unique, typeId alone
  // is not.
  // Each line names the type-gap P0s blocking the goals it serves, so a
  // caller can say which planet type each blocked goal is waiting on.
  const blockedDemand = new Map<number, number>();
  const blockedByType = new Map<number, Set<number>>();
  for (const g of triage.blocked) {
    if (boughtOutright.has(g)) continue;
    const own = new Map<number, number>();
    expandInto(own, [g], pi);
    for (const [typeId, units] of own) {
      blockedDemand.set(typeId, (blockedDemand.get(typeId) ?? 0) + units);
      const by = blockedByType.get(typeId) ?? new Set<number>();
      triage.blockedBy.get(g)!.forEach((p0) => by.add(p0));
      blockedByType.set(typeId, by);
    }
  }
  for (const [typeId, unitsPerHour] of blockedDemand) {
    lines.push({
      typeId,
      tier: tierOf(typeId),
      unitsPerHour,
      factories: factoriesFor(typeId, unitsPerHour, pi),
      source: 'blocked',
      madeFraction: 0,
      blockedBy: [...blockedByType.get(typeId)!].sort((a, b) => a - b),
    });
  }
  for (const g of dead) {
    if (triage.blocked.includes(g) && !boughtOutright.has(g)) continue;
    const tier = tierOf(g.typeId);
    const unitsPerHour = perHour(g);
    lines.push({
      typeId: g.typeId,
      tier,
      unitsPerHour,
      factories: factoriesFor(g.typeId, unitsPerHour, pi),
      source: boughtOutright.has(g) ? 'bought' : 'short',
      madeFraction: 0,
    });
  }
  const blockedLast = (l: DemandLine) => (l.source === 'blocked' ? 1 : 0);
  lines.sort((a, b) => b.tier - a.tier || a.typeId - b.typeId || blockedLast(a) - blockedLast(b));
  return lines;
}

/** Each goal at the rate the final plan reaches. */
export function achievedOf(args: {
  goals: readonly Goal[];
  dead: ReadonlySet<Goal>;
  boughtOutright: ReadonlySet<Goal>;
  highFraction: ReadonlyMap<number, number>;
  p1GoalReach: ReadonlyMap<number, number>;
  pi: PiData;
}): GoalPlan['achieved'] {
  const { goals, dead, boughtOutright, highFraction, p1GoalReach, pi } = args;
  return goals.map((g) => {
    const target = perHour(g);
    const unitsPerHour = boughtOutright.has(g)
      ? target
      : dead.has(g)
        ? 0
        : piTier(g.typeId, pi) >= 2
          ? target * (highFraction.get(g.typeId) ?? 0)
          : (p1GoalReach.get(g.typeId) ?? 0);
    return { typeId: g.typeId, unitsPerHour, fraction: unitsPerHour / target };
  });
}
