import { describe, expect, it } from 'vitest';
import { isAllowedSyncedSettingKey, SYNCED_SETTING_KEYS } from './syncedSettings';

// This literal is the second half of the deliberate two-file edit described in
// syncedSettings.ts. If you are here because this test broke: you added a key
// to SYNCED_SETTING_KEYS. Add it here too, and confirm the caller records
// deletions via deleteSyncedSetting so the tombstone path in merge.ts applies.
const PINNED_SYNCED_SETTING_KEYS: string[] = ['sync.notificationFeedPrefs'];

describe('SYNCED_SETTING_KEYS', () => {
  it('matches the pinned allow-list', () => {
    expect([...SYNCED_SETTING_KEYS].sort()).toEqual([...PINNED_SYNCED_SETTING_KEYS].sort());
  });

  it('every allowed key is sync.-prefixed and not internal', () => {
    for (const key of SYNCED_SETTING_KEYS) {
      expect(key.startsWith('sync.')).toBe(true);
      expect(key.startsWith('sync.__')).toBe(false);
    }
  });

  it('rejects keys that are not on the allow-list', () => {
    expect(isAllowedSyncedSettingKey('sync.notReal')).toBe(false);
    expect(isAllowedSyncedSettingKey('activeCharacterId')).toBe(false);
  });
});
