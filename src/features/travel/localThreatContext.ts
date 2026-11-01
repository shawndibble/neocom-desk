/**
 * Who else from a pilot's alliance or corporation is in the Local list on
 * screen (issue: Threat read against Local). The list writes it; a pilot's
 * profile, which opens in a modal with no Local of its own, reads it, so the
 * badge in the row and the one in the modal agree. Empty when no list is open.
 */
import { create } from 'zustand';
import type { PilotListRow } from './pilotListData';

interface LocalThreatContextState {
  /** Character id -> others from their alliance (or, without one, corporation) in Local. */
  matesById: ReadonlyMap<number, number>;
  set: (matesById: ReadonlyMap<number, number>) => void;
}

export const useLocalThreatContext = create<LocalThreatContextState>((set) => ({
  matesById: new Map(),
  set: (matesById) => set({ matesById }),
}));

/** For each pilot, how many others from their alliance (or corporation, with none) are in the list. */
export function orgMatesOf(rows: readonly PilotListRow[]): Map<number, number> {
  const key = (row: PilotListRow): string | null =>
    row.allianceId !== null
      ? `a${row.allianceId}`
      : row.corporationId !== null
        ? `c${row.corporationId}`
        : null;
  const sizes = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null && row.characterId !== null) sizes.set(k, (sizes.get(k) ?? 0) + 1);
  }
  const mates = new Map<number, number>();
  for (const row of rows) {
    const k = key(row);
    if (k !== null && row.characterId !== null) mates.set(row.characterId, (sizes.get(k) ?? 1) - 1);
  }
  return mates;
}
