import type { OreLine, QuantityDiff } from './types';

export function diffAssignedOreLines(
  assigned: readonly OreLine[],
  fresh: readonly OreLine[]
): QuantityDiff[] {
  const before = new Map(assigned.map((line) => [line.typeId, line.quantity]));
  const diffs: QuantityDiff[] = [];

  for (const line of fresh) {
    const previous = before.get(line.typeId) ?? 0;
    if (line.quantity > previous) {
      diffs.push({ typeId: line.typeId, before: previous, after: line.quantity });
    }
  }

  return diffs.sort((a, b) => a.typeId - b.typeId);
}
