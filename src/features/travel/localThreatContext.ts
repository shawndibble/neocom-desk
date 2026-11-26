import { create } from 'zustand';
import type { PilotListRow } from './pilotListData';

interface LocalThreatContextState {
  matesById: ReadonlyMap<number, number>;
  set: (matesById: ReadonlyMap<number, number>) => void;
}

export const useLocalThreatContext = create<LocalThreatContextState>((set) => ({
  matesById: new Map(),
  set: (matesById) => set({ matesById }),
}));

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
