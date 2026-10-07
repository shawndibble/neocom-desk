import type { MiningLedgerEntry, OreLine } from './types';

/**
 * Rebuilds the Mining Ledger Entry an Assignment-only (character, date,
 * system) stands for once ESI's 30-day window no longer returns it: the
 * covering Assignments' stored ore lines, summed per type.
 */
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
