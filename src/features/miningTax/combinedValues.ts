import type { MiningTaxAssignmentRecord } from '@/db';

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

export function dayTotalValues(estimatedValue: number, taxPct: number): CombinedDayValues {
  return { estimatedValue, taxOwed: (estimatedValue * taxPct) / 100 };
}

export function dayTaxValues(taxOwed: number, taxPct: number): CombinedDayValues | null {
  if (!(taxPct > 0)) return null;
  return { estimatedValue: Math.round((taxOwed * 100) / taxPct), taxOwed };
}
