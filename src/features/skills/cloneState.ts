import type { CloneState } from '@/engine/types';
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CLONE_STATES_KEY = 'sync.skillCloneStates';

export type CloneStatesValue = Record<number, 'alpha'>;

export function parseCloneStates(raw: unknown): CloneStatesValue {
  return (
    parseCharacterKeyedRecord<'alpha'>(raw, (value) => (value === 'alpha' ? 'alpha' : null)) ?? {}
  );
}

export function cloneStateFor(value: CloneStatesValue, characterId: number): CloneState {
  return value[characterId] === 'alpha' ? 'alpha' : 'omega';
}

export function withCloneState(
  value: CloneStatesValue,
  characterId: number,
  cloneState: CloneState
): CloneStatesValue {
  const next = { ...value };
  if (cloneState === 'alpha') next[characterId] = 'alpha';
  else delete next[characterId];
  return next;
}

export const useCloneStates = createSyncedSetting<CloneStatesValue>({
  key: SYNCED_CLONE_STATES_KEY,
  defaultValue: {},
  parse: parseCloneStates,
});
