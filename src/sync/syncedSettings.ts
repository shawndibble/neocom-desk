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
// sync.notificationFeedPrefs (issue #363): the feed half of Notification
// Preferences' per-Character event/eve-type toggles, plus the structure-fuel
// and corp-wallet thresholds. One key for every Character, not one per
// Character — see src/features/notifications/syncedPreferences.ts's doc
// comment for why (mergeSettings is whole-value LWW per key, and this
// allow-list is an exact-match Set, not a prefix match).
//
// Never deleted via deleteSyncedSetting: toggles are updates, not deletes
// (the issue's own words), and the key stays a valid, if empty, blob for as
// long as the account has any Character — the same "never deleted, only
// emptied" shape the Quickbar's local row already carries. So the tombstone
// edge above doesn't bite this key.
// sync.piCustomsRates: the PI Advisor's per-system customs rate overrides.
// One key holding a systemId -> rate map, for the same reason the key above
// holds every Character: mergeSettings is whole-value LWW per key and this
// list is exact-match, not a prefix match. See
// src/features/pi/customsOverride.ts.
//
// Never deleted via deleteSyncedSetting either: clearing one system's override
// empties an entry and leaves the blob valid, so the tombstone-expiry edge
// above does not bite this key.
export const SYNCED_SETTING_KEYS: readonly string[] = [
  'sync.notificationFeedPrefs',
  'sync.piCustomsRates',
];

const allowed = new Set(SYNCED_SETTING_KEYS);

/** True only for keys on the {@link SYNCED_SETTING_KEYS} allow-list. */
export function isAllowedSyncedSettingKey(key: string): boolean {
  return allowed.has(key);
}
