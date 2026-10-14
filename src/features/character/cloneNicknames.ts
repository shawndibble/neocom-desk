/**
 * The pilot's own name for each jump clone.
 *
 * ESI stopped returning jump clone names in 2021 (esi/esi-issues#1305):
 * `name` is in the schema but never in the payload, so every clone read as
 * unnamed however the pilot named it in game. The pilot names it here
 * instead. ESI's `name` still wins over nothing, in case CCP fixes it.
 *
 * Synced, one blob keyed by `jump_clone_id` (globally unique, so no Character
 * key is needed; `parseCharacterKeyedRecord` reads any integer-keyed record),
 * for the same exact-match allow-list reason as `sync.skillCloneStates`.
 * Clearing a name drops the entry; the key itself is never deleted, so the
 * tombstone-expiry edge in syncedSettings.ts does not bite it. The blob is
 * last-write-wins as a whole: two devices renaming different clones before
 * a sync keep only one of the two names.
 */
import type { JumpClone } from '@/esi/endpoints';
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CLONE_NICKNAMES_KEY = 'sync.cloneNicknames';

/** Longer than any in-game clone name; keeps one bad paste from bloating the synced blob. */
export const CLONE_NICKNAME_MAX = 64;

export type CloneNicknamesValue = Record<number, string>;

function clean(name: string): string {
  return name.trim().slice(0, CLONE_NICKNAME_MAX);
}

/** The stored blob with blank or non-string entries dropped. */
export function parseCloneNicknames(raw: unknown): CloneNicknamesValue {
  return (
    parseCharacterKeyedRecord<string>(raw, (value) =>
      typeof value === 'string' && clean(value) !== '' ? clean(value) : null
    ) ?? {}
  );
}

/** The value with one clone's nickname set; a blank name removes the entry. */
export function withCloneNickname(
  value: CloneNicknamesValue,
  jumpCloneId: number,
  name: string
): CloneNicknamesValue {
  const next = { ...value };
  const cleaned = clean(name);
  if (cleaned === '') delete next[jumpCloneId];
  else next[jumpCloneId] = cleaned;
  return next;
}

/** The clone's own name: the pilot's nickname, else ESI's, else undefined (callers fall back to its place). */
export function cloneOwnName(
  clone: Pick<JumpClone, 'jump_clone_id' | 'name'>,
  nicknames: CloneNicknamesValue
): string | undefined {
  return nicknames[clone.jump_clone_id] ?? (clone.name?.trim() || undefined);
}

export const useCloneNicknames = createSyncedSetting<CloneNicknamesValue>({
  key: SYNCED_CLONE_NICKNAMES_KEY,
  defaultValue: {},
  parse: parseCloneNicknames,
});

/**
 * Sets one clone's nickname. Hydrates first: merged into the empty default
 * before the stored blob is read, a save would push a one-entry blob that
 * wipes every other name on every device.
 */
export async function saveCloneNickname(jumpCloneId: number, name: string): Promise<void> {
  await useCloneNicknames.getState().hydrate();
  const { value, setValue } = useCloneNicknames.getState();
  await setValue(withCloneNickname(value, jumpCloneId, name));
}

/** The stored nicknames, for a loader outside React. */
export async function readCloneNicknames(): Promise<CloneNicknamesValue> {
  await useCloneNicknames.getState().hydrate();
  return useCloneNicknames.getState().value;
}
