// The complete allow-list of device-local setting keys "Reset saved view
// preferences" clears.
//
// Deliberately a hand-maintained list plus a pinned test, the same shape (and
// for the same reason) as `sync/syncedSettings.ts`'s SYNCED_SETTING_KEYS: the
// friction is the point. Whoever adds a preference has to decide which side of
// the line it falls on, and the alternative — clearing `db.settings` wholesale
// — would silently destroy real user work.
//
// **What belongs here:** a preference the page sets silently as the pilot uses
// it, with no control of its own on the Settings page. Forgetting one costs a
// pilot a re-sort or a re-filter, never data.
//
// **What must NEVER be added:**
//
// - User-created content. `overviewGroups` (hand-made character groups),
//   `comparisons` (saved skill comparisons), `characters.starred`,
//   `miningTax.manualMoonOreTypeIds` / `miningTax.manualIgnoredTypeIds` (ore
//   classifications, which have their own undo on the ledger). Clearing any of
//   these throws away work the pilot did on purpose.
// - Anything with its own control on the Settings page — `fontScale`,
//   `timeFormat`, and every Defaults/Corporation panel preference, which now
//   live under `sync.` keys (`sync.marketHub`, `sync.marketPricePercent`,
//   `sync.industryAssumedMe`, `sync.industryAssumedTe`,
//   `sync.industryFacilityDefaults`, `sync.piExpiringSoonHours`,
//   `sync.corpDarkAfterDays`, `sync.defaultCharacterFilter`) and are excluded
//   twice over by the bullet below. Not a count — one more lands every time a
//   preference does, and the pinned test in `viewPreferenceKeys.test.ts` is
//   what actually holds the line.
//   A pilot who set one deliberately would not expect a button labelled "view
//   preferences" to revert it; those are changed where they are shown. Their
//   pre-sync rows (`marketHub`, `industryAssumedMe`, ...) are left behind on
//   purpose (`lib/useSyncedSetting.ts`) and stay out of this list for the same
//   reason: clearing one would strand an older bundle on the default.
// - App bookkeeping. `activeCharacterId`, `corp.rosterBaseline`, the
//   notification preference/permission/poller keys, `installPrompt.seen`, and
//   every `sync.` key (planSync's namespace, which `createLocalSetting`
//   rejects outright).
export const VIEW_PREFERENCE_KEYS: readonly string[] = [
  'assetsItemSort',
  'assetsRoutePreference',
  'assetsStationSort',
  'calendarHiddenKinds',
  'calendarView',
  'corp.assetsExpanded',
  'industryLastOpenedPlan',
  'loyaltyStorePriceBasis',
  'mailFolders',
  'marketLocationMode',
  'marketPriceHistoryRange',
  'miningTaxStatusFilter',
  'piAdvisorAltColonies',
  'piColoniesShowAlts',
  'piMarketSourcing',
  'piPlanControls',
  'planColumnVisibility.v2',
  'planGroupingMode',
];
