// The complete allow-list of setting keys permitted to sync across devices.
//
// Adding a key here is deliberately a THREE-file edit: this list, the pinned
// literal in syncedSettings.test.ts, and the words that account for it in the
// FAQ's "What We Store" line — `settings.faq.store.synced.settingsNote` plus
// its entry in FaqPanel.test.tsx's SETTING_KEY_TO_PHRASE, which fails until
// whoever added the key decides what the reader is told. (That third file is
// easy to miss running narrow tests; CI catches it.) The friction is the
// point — whoever adds a synced setting has to reckon with the promise the
// FAQ makes to the user, and with the delete semantics in merge.ts:
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
//
// sync.marketPricePercent: the percentage of market the Market page's
// Appraisal tab prices a pasted list at. It sits in the same control cluster
// as sync.marketHub and answers the same kind of question — "I value my loot
// at 90% of Jita" is a fact about how the pilot trades, not about the machine
// they opened — so one of the pair travelling while the other did not would be
// a difference with nothing behind it. Same "set to another value, never
// unset" shape as everything above (the field holds a value at all times and
// no control clears it), so the tombstone-expiry edge does not bite this one
// either. No `legacyKey`: the preference is new, with no device-local life to
// seed from.
export const SYNCED_SETTING_KEYS: readonly string[] = [
  'sync.corpDarkAfterDays',
  'sync.defaultCharacterFilter',
  'sync.industryAssumedMe',
  'sync.industryFacilityDefaults',
  'sync.marketHub',
  'sync.marketPricePercent',
  'sync.notificationFeedPrefs',
  'sync.piCustomsRates',
  'sync.piExpiringSoonHours',
];

const allowed = new Set(SYNCED_SETTING_KEYS);

/** True only for keys on the {@link SYNCED_SETTING_KEYS} allow-list. */
export function isAllowedSyncedSettingKey(key: string): boolean {
  return allowed.has(key);
}
