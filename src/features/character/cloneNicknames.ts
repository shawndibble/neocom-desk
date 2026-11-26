import type { JumpClone } from '@/esi/endpoints';
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_CLONE_NICKNAMES_KEY = 'sync.cloneNicknames';

export const CLONE_NICKNAME_MAX = 64;

export type CloneNicknamesValue = Record<number, string>;

function clean(name: string): string {
  return name.trim().slice(0, CLONE_NICKNAME_MAX);
}

export function parseCloneNicknames(raw: unknown): CloneNicknamesValue {
  return (
    parseCharacterKeyedRecord<string>(raw, (value) =>
      typeof value === 'string' && clean(value) !== '' ? clean(value) : null
    ) ?? {}
  );
}

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

export async function saveCloneNickname(jumpCloneId: number, name: string): Promise<void> {
  await useCloneNicknames.getState().hydrate();
  const { value, setValue } = useCloneNicknames.getState();
  await setValue(withCloneNickname(value, jumpCloneId, name));
}

export async function readCloneNicknames(): Promise<CloneNicknamesValue> {
  await useCloneNicknames.getState().hydrate();
  return useCloneNicknames.getState().value;
}
