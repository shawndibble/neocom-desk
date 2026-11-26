import type { MiningLedgerEntry, OreLine } from './types';

export function entryFromAssignments(
  characterId: number,
  date: string,
  solarSystemId: number,
  assignments: readonly { oreLines: readonly OreLine[] }[]
): MiningLedgerEntry {
  const totals = new Map<number, number>();
  for (const assignment of assignments) {
    for (const line of assignment.oreLines) {
      totals.set(line.typeId, (totals.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  const oreLines = [...totals]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .sort((a, b) => a.typeId - b.typeId);
  return { characterId, date, solarSystemId, oreLines };
}
