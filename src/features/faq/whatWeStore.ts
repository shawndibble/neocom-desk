/**
 * The "What We Store" answer, as data.
 *
 * Shaped like `lib/shortcuts.ts`'s `SHORTCUTS`: a module-level list of
 * translation-key pairs the panel maps over, rather than prose baked into JSX
 * or a wall of numbered `item1`..`item12` keys. Order lives here, in code;
 * wording lives in `en.json`.
 *
 * This list is a **user-facing commitment**, not documentation. It is written
 * from what actually reaches a server — the synced collection registry
 * (`sync/syncedCollections.ts`), whose every declaration names the line here
 * that tells the pilot about it (`faqItem`), the `SYNCED_SETTING_KEYS`
 * allow-list in `sync/syncedSettings.ts`, and `instrument.ts`'s Sentry
 * configuration. Anything added to any of those makes this list wrong until
 * it is added here too. See the scope decision recorded alongside this
 * feature.
 *
 * Deliberately honest about the four places where something EVE-derived, or
 * anything at all, does leave the device, because a section that overclaimed
 * would be worth less than one that did not exist: Notification Feed rows
 * (already shown to the user, so another device can catch up), Scheduled Push
 * occurrences (rendered ahead of time because the backend holds no SDE and no
 * i18n catalog — `functions/src/registerDevice.ts`), crash reports, and an
 * exported backup file (issue #789) — the one case that is not automatic:
 * it only happens when the pilot presses the button, and the file (including
 * sign-in tokens) goes wherever they choose to put it, not to us. Each is
 * stated in the FAQ's own answers (`FaqPanel.tsx`, `settings.faq.store.notes.*`) rather than buried.
 */

import type { SyncedFaqItemId } from '@/sync/syncedCollections';

/** One line in a group: a short label, plus a note when the label alone would leave a real question. */
export interface WhatWeStoreItem {
  id: string;
  labelKey: string;
  noteKey?: string;
  /**
   * Sub-bullets under the label, one per area, for a line that covers too much
   * to read as one sentence (the synced preferences) — skimmable, where a
   * single run-on note was not.
   */
  detailKeys?: readonly string[];
}

/**
 * A line in the synced group. Its id is the `faqItem` that one or more
 * registry declarations point at, so a typo'd or renamed line fails to
 * compile rather than silently orphaning a collection.
 */
interface SyncedWhatWeStoreItem extends WhatWeStoreItem {
  id: SyncedFaqItemId;
}

export interface WhatWeStoreGroup {
  id: string;
  titleKey: string;
  descriptionKey: string;
  items: readonly WhatWeStoreItem[];
}

/**
 * Two groups, in the order that answers the question a reader actually
 * arrives with: what leaves this device, and what does not.
 *
 * There is deliberately no third "never collected at all" group. A list of
 * things we don't hold is unfalsifiable by the reader and unbounded by
 * nature — it invites padding, and it reads as protesting rather than
 * answering. What the two groups above account for is the whole of what
 * exists; anything absent from both is absent because it is not stored.
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
      { id: 'fittings', labelKey: 'settings.faq.store.synced.fittings' },
      {
        id: 'notificationFeed',
        labelKey: 'settings.faq.store.synced.notificationFeed',
        noteKey: 'settings.faq.store.synced.notificationFeedNote',
      },
      {
        id: 'settings',
        labelKey: 'settings.faq.store.synced.settings',
        detailKeys: [
          'settings.faq.store.synced.settingsDetail.notifications',
          'settings.faq.store.synced.settingsDetail.defaults',
          'settings.faq.store.synced.settingsDetail.industry',
          'settings.faq.store.synced.settingsDetail.market',
          'settings.faq.store.synced.settingsDetail.skills',
          'settings.faq.store.synced.settingsDetail.fittings',
          'settings.faq.store.synced.settingsDetail.pi',
          'settings.faq.store.synced.settingsDetail.layout',
          'settings.faq.store.synced.settingsDetail.travel',
        ],
      },
    ] satisfies readonly SyncedWhatWeStoreItem[],
  },
  {
    id: 'local',
    titleKey: 'settings.faq.store.local.title',
    descriptionKey: 'settings.faq.store.local.description',
    items: [
      { id: 'esi', labelKey: 'settings.faq.store.local.esi' },
      { id: 'corp', labelKey: 'settings.faq.store.local.corp' },
      { id: 'market', labelKey: 'settings.faq.store.local.market' },
      { id: 'miningHistory', labelKey: 'settings.faq.store.local.miningHistory' },
      {
        id: 'login',
        labelKey: 'settings.faq.store.local.login',
        noteKey: 'settings.faq.store.local.loginNote',
      },
      { id: 'preferences', labelKey: 'settings.faq.store.local.preferences' },
    ],
  },
];
