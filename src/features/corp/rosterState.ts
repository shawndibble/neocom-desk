import {
  createPollerStateStore,
  withCharacterSnapshot,
} from '@/features/notifications/pollerState';

export interface RosterSnapshot {
  nowMs: number;
  corporationId: number;
  memberIds: number[];
}

function isRosterSnapshot(raw: unknown): raw is RosterSnapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const record = raw as Record<string, unknown>;
  return (
    typeof record.nowMs === 'number' &&
    typeof record.corporationId === 'number' &&
    Array.isArray(record.memberIds) &&
    record.memberIds.every((id) => typeof id === 'number')
  );
}

export const useCorpRosterState = createPollerStateStore<RosterSnapshot>(
  'corp.rosterBaseline',
  isRosterSnapshot
);

async function rosterState() {
  await useCorpRosterState.getState().hydrate();
  return useCorpRosterState.getState().value;
}

export async function readPreviousRoster(
  characterId: number,
  corporationId: number
): Promise<number[] | undefined> {
  const snapshot = (await rosterState())[characterId];
  if (snapshot === undefined || snapshot.corporationId !== corporationId) return undefined;
  return snapshot.memberIds;
}

export async function recordRoster(
  characterId: number,
  corporationId: number,
  memberIds: readonly number[],
  nowMs: number
): Promise<void> {
  const state = await rosterState();
  await useCorpRosterState
    .getState()
    .setValue(
      withCharacterSnapshot(state, characterId, { nowMs, corporationId, memberIds: [...memberIds] })
    );
}
