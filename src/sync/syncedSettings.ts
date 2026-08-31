// The complete allow-list of setting keys permitted to sync across devices.
//
// Adding a key here is deliberately a two-file edit: this list AND the pinned
// literal in syncedSettings.test.ts. The friction is the point — whoever adds
// a synced setting has to reckon with the delete semantics in merge.ts:
// mergeSettings. A deleted synced setting propagates via a tombstone; the
// remote tombstone expires after 30 days (TOMBSTONE_TTL_MS), so a device
// offline past that window never sees the delete and re-pushes its stale copy.
// That is the known, accepted edge — the same one Skill Plans carry.
//
// There are no synced settings in production yet, so this list is empty.
export const SYNCED_SETTING_KEYS: readonly string[] = [];

const allowed = new Set(SYNCED_SETTING_KEYS);

/** True only for keys on the {@link SYNCED_SETTING_KEYS} allow-list. */
export function isAllowedSyncedSettingKey(key: string): boolean {
  return allowed.has(key);
}
