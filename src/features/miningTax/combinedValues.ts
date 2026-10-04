import type { MiningTaxAssignmentRecord } from '@/db';

/**
 * What each ore line of one day starts at in the combined entry's edit form
 * (`CombinedEditDialog`): the day's own per-ore corrections when it has
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
