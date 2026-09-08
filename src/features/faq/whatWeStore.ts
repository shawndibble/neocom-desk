/**
 * The "What We Store" answer, as data.
 *
 * Shaped like `lib/shortcuts.ts`'s `SHORTCUTS`: a module-level list of
 * translation-key pairs the panel maps over, rather than prose baked into JSX
 * or a wall of numbered `item1`..`item12` keys. Order lives here, in code;
 * wording lives in `en.json`.
 *
 * This list is a **user-facing commitment**, not documentation. It is written
 * from what actually reaches a server — the `CollectionSpec`s in
 * `sync/planSync.ts`, the `SYNCED_SETTING_KEYS` allow-list in
 * `sync/syncedSettings.ts`, and `instrument.ts`'s Sentry configuration.
 * Anything added to any of those makes this list wrong until it is added here
 * too. See the scope decision recorded alongside this feature.
 *
 * Deliberately honest about the three places where something EVE-derived, or
 * anything at all, does leave the device, because a section that overclaimed
 * would be worth less than one that did not exist: Notification Feed rows
 * (already shown to the user, so another device can catch up), Scheduled Push
 * occurrences (rendered ahead of time because the backend holds no SDE and no
 * i18n catalog — `functions/src/registerDevice.ts`), and crash reports. Each
 * is stated in {@link WHAT_WE_STORE_NOTES} rather than buried.
 */

/** One line in a group: a short label, plus a note when the label alone would leave a real question. */
export interface WhatWeStoreItem {
  id: string;
  labelKey: string;
  noteKey?: string;
}

export interface WhatWeStoreGroup {
  id: string;
  titleKey: string;
  descriptionKey: string;
  items: readonly WhatWeStoreItem[];
}

/**
 * Three groups, in the order that answers the question a worried reader
 * actually arrives with: what leaves this device, what does not, and what is
 * never collected at all.
 */
export const WHAT_WE_STORE_GROUPS: readonly WhatWeStoreGroup[] = [
  {
    id: 'synced',
    titleKey: 'settings.faq.store.synced.title',
    descriptionKey: 'settings.faq.store.synced.description',
    items: [
      { id: 'skillPlans', labelKey: 'settings.faq.store.synced.skillPlans' },
      { id: 'buildPlans', labelKey: 'settings.faq.store.synced.buildPlans' },
      { id: 'productionRuns', labelKey: 'settings.faq.store.synced.productionRuns' },
      { id: 'quickbar', labelKey: 'settings.faq.store.synced.quickbar' },
      { id: 'stationPins', labelKey: 'settings.faq.store.synced.stationPins' },
      { id: 'piPicks', labelKey: 'settings.faq.store.synced.piPicks' },
      {
        id: 'miningTax',
        labelKey: 'settings.faq.store.synced.miningTax',
        noteKey: 'settings.faq.store.synced.miningTaxNote',
      },
      {
        id: 'notificationFeed',
        labelKey: 'settings.faq.store.synced.notificationFeed',
        noteKey: 'settings.faq.store.synced.notificationFeedNote',
      },
      { id: 'settings', labelKey: 'settings.faq.store.synced.settings' },
    ],
  },
  {
    id: 'local',
    titleKey: 'settings.faq.store.local.title',
    descriptionKey: 'settings.faq.store.local.description',
    items: [
      { id: 'esi', labelKey: 'settings.faq.store.local.esi' },
      { id: 'corp', labelKey: 'settings.faq.store.local.corp' },
      { id: 'market', labelKey: 'settings.faq.store.local.market' },
      {
        id: 'login',
        labelKey: 'settings.faq.store.local.login',
        noteKey: 'settings.faq.store.local.loginNote',
      },
      { id: 'preferences', labelKey: 'settings.faq.store.local.preferences' },
    ],
  },
  {
    id: 'never',
    titleKey: 'settings.faq.store.never.title',
    descriptionKey: 'settings.faq.store.never.description',
    items: [
      {
        id: 'password',
        labelKey: 'settings.faq.store.never.password',
        noteKey: 'settings.faq.store.never.passwordNote',
      },
      { id: 'identity', labelKey: 'settings.faq.store.never.identity' },
      { id: 'account', labelKey: 'settings.faq.store.never.account' },
      { id: 'unadded', labelKey: 'settings.faq.store.never.unadded' },
    ],
  },
];

/**
 * The three "yes, but" cases, stated plainly under the groups above rather
 * than folded into them: each is a real exception a careful reader would
 * otherwise catch us omitting.
 */
export const WHAT_WE_STORE_NOTES: readonly string[] = [
  'settings.faq.store.notes.push',
  'settings.faq.store.notes.crashes',
  'settings.faq.store.notes.removal',
];
