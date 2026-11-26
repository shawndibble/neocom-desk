import type { Shortfall } from '../goalTypes';
import { copyWants, fill, type ExtractionProblem, type Wants } from './extraction';
import { EPSILON } from './shared';

export interface Gaps {
  bought: Map<number, number>;
  budgetGapP1: Set<number>;
  shortfalls: Shortfall[];
}

export function findGaps(
  problem: ExtractionProblem,
  wants: Wants,
  extracted: ReadonlyMap<number, number>
): Gaps {
  const { policy } = problem;
  const bought = new Map<number, number>();
  const budgetGapP1 = new Set<number>();
  const shortfalls: Shortfall[] = [];
  for (const row of problem.rows) {
    const unmet = row.units - (extracted.get(row.p1) ?? 0);
    if (unmet <= EPSILON) continue;
    if (problem.buyP1) {
      bought.set(row.p1, unmet);
      continue;
    }
    if (fill(problem, copyWants(wants), row, unmet) > EPSILON) continue;
    budgetGapP1.add(row.p1);
    shortfalls.push({
      kind: 'budget-gap',
      p0TypeId: row.p0,
      p1TypeId: row.p1,
      unitsPerHour: unmet / row.p1PerP0,
      p1UnitsPerHour: unmet,
      retargetCandidates: problem.colonies
        .filter(
          (c) =>
            c.ratePerEcu.has(row.p0) &&
            (wants.get(c.planetId)?.find((w) => w.p0TypeId === row.p0)?.ecus ?? 0) <
              policy.maxEcusPerColony
        )
        .map((c) => c.planetId),
    });
  }
  return { bought, budgetGapP1, shortfalls };
}

const SHORTFALL_ORDER: Readonly<Record<Shortfall['kind'], number>> = {
  'no-factory-host': 0,
  'host-over-budget': 1,
  'type-gap': 2,
  'budget-gap': 3,
};

export function compareShortfalls(a: Shortfall, b: Shortfall): number {
  const kind = SHORTFALL_ORDER[a.kind] - SHORTFALL_ORDER[b.kind];
  if (kind !== 0) return kind;
  const id = (s: Shortfall) => ('p0TypeId' in s ? s.p0TypeId : 0);
  return id(a) - id(b);
}
