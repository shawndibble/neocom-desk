import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { isAllowedSyncedSettingKey } from '@/sync/syncedSettings';
import { subscribeSyncStatus } from '@/sync/status';
import { scheduleSync, setSyncedSetting } from '@/sync';
import { createSettingStore, type StoredRow } from './settingStore';
import { settingCoercer, type LocalSettingStore } from './useLocalSetting';

const SYNCED_PREFIX = 'sync.';

export interface SyncedSettingOptions<T> {
  key: string;
  legacyKey?: string;
  defaultValue: T;
  parse?: (raw: unknown) => T | null;
  onApply?: (value: T) => void;
}

export function createSyncedSetting<T>(options: SyncedSettingOptions<T>): LocalSettingStore<T> {
  const { key, legacyKey, defaultValue, parse, onApply } = options;

  if (!key.startsWith(SYNCED_PREFIX)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  if (!isAllowedSyncedSettingKey(key)) {
    throw new Error(
      `'${key}' is not on the synced-settings allow-list. Add it to SYNCED_SETTING_KEYS ` +
        `in src/sync/syncedSettings.ts (and its pinned test).`
    );
  }
  if (legacyKey?.startsWith(SYNCED_PREFIX)) {
    throw new Error(`A legacy key is the pre-sync device-local one (got '${legacyKey}')`);
  }

  let adopted = false;

  async function read(): Promise<StoredRow | undefined> {
    const row = await db.settings.get(key);
    if (row !== undefined) return row;
    if (legacyKey === undefined || adopted) return undefined;
    const legacy = await db.settings.get(legacyKey);
    if (legacy === undefined) return undefined;
    adopted = true;
    await db.settings.put({ key, value: legacy.value });
    return legacy;
  }

  async function write(value: T): Promise<void> {
    await db.settings.put({ key, value });
    if (!isSyncConfigured()) return;
    try {
      await setSyncedSetting(key, value);
      const characters = await db.characters.toArray();
      for (const character of characters)
        scheduleSync(character.characterId, { collections: ['settings'] });
    } catch {}
  }

  function subscribeExternal(reread: () => void): void {
    if (!isSyncConfigured()) return;
    let seenAt: number | null = null;
    subscribeSyncStatus((status) => {
      if (status.state !== 'idle' || status.lastSyncedAt === null) return;
      if (status.lastSyncedAt === seenAt) return;
      seenAt = status.lastSyncedAt;
      reread();
    });
  }

  return createSettingStore<T>({
    defaultValue,
    onApply,
    coerce: settingCoercer(defaultValue, parse),
    read,
    write,
    subscribeExternal,
  });
}
