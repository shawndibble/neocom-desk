/**
 * Clone State (CONTEXT.md): whether each Character is Alpha or Omega.
 *
 * ESI has no field for it (CONTEXT.md "Character Not Training"), so the pilot
 * sets it. Default Omega — the rate every plan was costed at before this
 * existed — so a Character nobody has touched keeps quoting the same times.
 *
 * Synced, one blob keyed by Character id, for the same reason as
 * `sync.industryBuildGroups`: the allow-list matches exact keys only. Only
 * Alpha is stored; flipping back to Omega drops the entry, and the key itself
 * is never deleted, so the tombstone-expiry edge in syncedSettings.ts does
 * not bite it.
 */
import type { CloneState } from '@/engine/types';
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CLONE_STATES_KEY = 'sync.skillCloneStates';

export type CloneStatesValue = Record<number, 'alpha'>;

/** The stored blob with anything but an Alpha entry dropped. */
export function parseCloneStates(raw: unknown): CloneStatesValue {
  return (
    parseCharacterKeyedRecord<'alpha'>(raw, (value) => (value === 'alpha' ? 'alpha' : null)) ?? {}
  );
}

export function cloneStateFor(value: CloneStatesValue, characterId: number): CloneState {
  return value[characterId] === 'alpha' ? 'alpha' : 'omega';
}

/** The value with one Character's state set; Omega removes the entry. */
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
