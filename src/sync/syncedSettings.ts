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
//
// The five preferences behind Settings' Defaults and Corporation panels: the
// trade hub the Market Browser opens at, the facility a first Build Plan
// assumes, the ME an unowned sub-build is quoted at, the PI expiring-soon
// window, and the corp roster's dark threshold. A pilot who says "quote my
// builds at my rigged Azbel" is answering for themselves, not for one machine,
// and had to answer again on every device.
//
// One key each, unlike the two blobs above: the set of defaults is fixed and
// small, so an exact-match entry per preference is expressible — and each key
// merges on its own, so changing the hub on a laptop cannot roll back an ME
// set on a phone. The blob shape is what an *unbounded* key space (one entry
// per Character, per system) forces; it is not the preferred shape.
//
// Never deleted via deleteSyncedSetting: a preference is set to another value,
// never unset — there is no control that removes one — so the tombstone-expiry
// edge above does not bite these either. Each is seeded from the device-local
// key it used before it synced; `lib/useSyncedSetting.ts` explains why that
// seed is written unstamped.
//
// sync.defaultCharacterFilter (issue #607): a sixth Defaults-panel preference,
// added later than the five above and with no device-local life to seed from
// (no `legacyKey`). Which Character(s) a cross-character view (Wallet
// Balance, Industry Active Jobs) opens on by default — `'current'`, `'all'`,
// or a hand-picked subset, stored as `StoredCharacterFilterValue`
// (`features/character/characterFilterValue.ts`) since a `Set` is not
// Firestore-safe. Same "set to another value, never unset" shape as the five
// above, so the tombstone-expiry edge does not bite this one either.
// sync.industryBuildGroups (issue #626): a blob like the two above, and for
// the same reason — the key space is unbounded (one entry per Build Group, per
// Character), so one key per group is not expressible against an exact-match
// allow-list. Holds only each group's id, name and order; which plans are in
// it lives on `BuildPlanRecord.buildGroupId`, so the LWW clobber this shape
// accepts can cost a name or an ordinal and never a plan's membership.
//
// Never deleted via deleteSyncedSetting either: deleting a group removes an
// entry from the blob and rewrites it, so the key itself outlives every group
// it ever held and the tombstone-expiry edge above does not bite it. That is
// also why a group deleted on a laptop left offline for a month cannot
// resurrect the way a per-document collection's would.
export const SYNCED_SETTING_KEYS: readonly string[] = [
  'sync.corpDarkAfterDays',
  'sync.defaultCharacterFilter',
  'sync.industryAssumedMe',
  'sync.industryBuildGroups',
  'sync.industryFacilityDefaults',
  'sync.marketHub',
  'sync.notificationFeedPrefs',
  'sync.piCustomsRates',
  'sync.piExpiringSoonHours',
];

const allowed = new Set(SYNCED_SETTING_KEYS);

/** True only for keys on the {@link SYNCED_SETTING_KEYS} allow-list. */
export function isAllowedSyncedSettingKey(key: string): boolean {
  return allowed.has(key);
}
