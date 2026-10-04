import type { MiningTaxAssignmentRecord } from '@/db';

/**
 * What each ore line of one day starts at in the combined entry's edit form
 * (`EntryEditDialog`): the day's own per-ore corrections when it has
 * them, otherwise its billed `estimatedValue` shared out by each line's
 * market worth on the mined date — or by units when nothing is priced. A
 * share of the stored figure, never a fresh re-price, so the boxes add up to
 * exactly what the day was billed at until the pilot changes one.
 */
export function combinedLineDefaults(
  assignment: MiningTaxAssignmentRecord,
  prices: ReadonlyMap<number, number>
): Map<number, number> {
  const stored = assignment.oreLineValues;
  if (stored && assignment.oreLines.every((line) => stored[line.typeId] !== undefined)) {
    return new Map(assignment.oreLines.map((line) => [line.typeId, stored[line.typeId]]));
  }
  const worth = assignment.oreLines.map((line) => line.quantity * (prices.get(line.typeId) ?? 0));
  const totalWorth = worth.reduce((sum, w) => sum + w, 0);
  const totalUnits = assignment.oreLines.reduce((sum, line) => sum + line.quantity, 0);
  return new Map(
    assignment.oreLines.map((line, i) => {
      const share =
        totalWorth > 0 ? worth[i] / totalWorth : totalUnits > 0 ? line.quantity / totalUnits : 0;
      return [line.typeId, assignment.estimatedValue * share];
    })
  );
}

export interface CombinedDayValues {
  estimatedValue: number;
  taxOwed: number;
  oreLineValues?: Record<number, number>;
}

/**
 * One day's figures as the combined edit form would save them. A day with no
 * edited line keeps the value it was billed at, and its tax owed too unless
 * the rate changed; an edited day is re-totalled from its lines — the edited
 * ones as typed, the rest at their `lineDefaults` share — and stores them as
 * its per-ore corrections.
 */
export function combinedDayValues(
  assignment: MiningTaxAssignmentRecord,
  edits: Readonly<Record<number, number>>,
  lineDefaults: ReadonlyMap<number, number>,
  taxPct: number
): CombinedDayValues {
  if (Object.keys(edits).length === 0) {
    return {
      estimatedValue: assignment.estimatedValue,
      taxOwed:
        taxPct === assignment.taxPct
          ? assignment.taxOwed
          : (assignment.estimatedValue * taxPct) / 100,
      ...(assignment.oreLineValues ? { oreLineValues: assignment.oreLineValues } : {}),
    };
  }
  const oreLineValues: Record<number, number> = {};
  for (const line of assignment.oreLines) {
    oreLineValues[line.typeId] = edits[line.typeId] ?? lineDefaults.get(line.typeId) ?? 0;
  }
  const estimatedValue = Object.values(oreLineValues).reduce((sum, v) => sum + v, 0);
  return { estimatedValue, taxOwed: (estimatedValue * taxPct) / 100, oreLineValues };
}

/**
 * One day's figures when the pilot types the whole day's value rather than
 * each ore's ("edit ore values individually" off). No per-ore corrections
 * are kept: the ones the day stored would no longer add up to the new total.
 */
export function dayTotalValues(estimatedValue: number, taxPct: number): CombinedDayValues {
  return { estimatedValue, taxOwed: (estimatedValue * taxPct) / 100 };
}
