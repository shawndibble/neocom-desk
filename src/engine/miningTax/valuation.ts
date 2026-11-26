import type { OreLine } from './types';

export interface AssignmentValue {
  estimatedValue: number;
  taxOwed: number;
}

export function computeAssignmentValue(
  oreLines: readonly OreLine[],
  unitPrices: ReadonlyMap<number, number>,
  taxPct: number,
  oreLineValues?: ReadonlyMap<number, number>
): AssignmentValue {
  const estimatedValue = oreLines.reduce(
    (sum, line) =>
      sum + (oreLineValues?.get(line.typeId) ?? line.quantity * (unitPrices.get(line.typeId) ?? 0)),
    0
  );
  return { estimatedValue, taxOwed: estimatedValue * (taxPct / 100) };
}
