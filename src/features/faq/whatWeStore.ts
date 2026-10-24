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
 * Shared Community data is a third group: it lives in its own Firestore
 * collections under `communities/{id}` (ADR 0018, 0021), not in the per-
 * Character registry, so it has its own typed map
 * ({@link COMMUNITY_COLLECTION_FAQ_ITEM}) and `FaqPanel.test.tsx` checks it
 * against `firestore.rules`: a collection added there fails the test until it
 * is mapped to a line here.
 *
 * A corporation's own records are the fourth: SRP Claims (ADR 0026) and the
 * Corp Tax Book (ADR 0023) live under `corps/{id}`, belong to the corporation
 * rather than to one Character, and so outlive Delete all data.
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

/** A line in the Communities group: the Firestore collections below point at these. */
export type CommunityFaqItemId =
  'membership' | 'blueprints' | 'fittings' | 'plans' | 'requests' | 'payouts' | 'pledges' | 'mail';

/**
 * Every collection Communities keep on the server, and the "What do Communities
 * share?" line that tells the pilot about it. `members`, `library`, `requests`
 * (Join Requests), `mailInvites`, `itemRequests`, `fleetPayouts`, `shares`, `pledges`, `pledgeMails`,
 * `fittings` and `skillPlans` sit under `communities/{id}`; the last three sit
 * under `characters/{uid}` and are bookkeeping (which Communities a Character is
 * in, and the day's mail counts). Exhaustive on purpose.
 */
export const COMMUNITY_COLLECTION_FAQ_ITEM = {
  members: 'membership',
  library: 'blueprints',
  requests: 'membership',
  mailInvites: 'membership',
  itemRequests: 'requests',
  fleetPayouts: 'payouts',
  shares: 'payouts',
  pledges: 'pledges',
  pledgeMails: 'mail',
  fittings: 'fittings',
  skillPlans: 'plans',
  communities: 'membership',
  mailInviteQuota: 'mail',
  requestMailQuota: 'mail',
} as const satisfies Record<string, CommunityFaqItemId>;

/** The Community lines, as the panel lists them. */
const COMMUNITY_ITEMS: readonly (WhatWeStoreItem & { id: CommunityFaqItemId })[] = [
  'membership',
  'blueprints',
  'fittings',
  'plans',
  'requests',
  'payouts',
  'pledges',
  'mail',
].map((id) => ({ id: id as CommunityFaqItemId, labelKey: `settings.faq.store.communities.${id}` }));

/**
 * Four groups, in the order that answers the question a reader actually
 * arrives with: what leaves this device, what does not, what other players
 * can read once you join a Community, and what your corporation keeps.
 *
 * There is deliberately no "never collected at all" group. A list of
 * things we don't hold is unfalsifiable by the reader and unbounded by
 * nature — it invites padding, and it reads as protesting rather than
 * answering. What the groups above account for is the whole of what
 * exists; anything absent from all is absent because it is not stored.
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
      { id: 'netWorthSnapshots', labelKey: 'settings.faq.store.synced.netWorthSnapshots' },
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
      { id: 'walletHistory', labelKey: 'settings.faq.store.local.walletHistory' },
      { id: 'jobHistory', labelKey: 'settings.faq.store.local.jobHistory' },
      {
        id: 'login',
        labelKey: 'settings.faq.store.local.login',
        noteKey: 'settings.faq.store.local.loginNote',
      },
      { id: 'preferences', labelKey: 'settings.faq.store.local.preferences' },
      { id: 'ansiblex', labelKey: 'settings.faq.store.local.ansiblex' },
    ],
  },
  {
    id: 'communities',
    titleKey: 'settings.faq.store.communities.title',
    descriptionKey: 'settings.faq.store.communities.description',
    items: COMMUNITY_ITEMS,
  },
  {
    id: 'corp',
    titleKey: 'settings.faq.store.corp.title',
    descriptionKey: 'settings.faq.store.corp.description',
    items: [
      { id: 'srp', labelKey: 'settings.faq.store.corp.srp' },
      { id: 'corpTaxBook', labelKey: 'settings.faq.store.corp.corpTaxBook' },
    ],
  },
];

/** One line of the retention answer: what is kept, and for how long. */
export interface RetentionItem {
  id: string;
  labelKey: string;
  durationKey: string;
}

export interface RetentionGroup {
  id: 'device' | 'server';
  titleKey: string;
  items: readonly RetentionItem[];
}

/**
 * How long each kind of data is kept, on this device and on the server. Like
 * the store groups above, a user-facing commitment: the numbers mirror the
 * code that enforces them (`engine/miningTax/ledgerHistory.ts`,
 * `engine/wallet/archiveCoverage.ts`,
 * `esi/cachePrune.ts`, `features/notifications/feed.ts`, `sync/merge.ts`,
 * `functions/src/purgeStaleAccounts.ts`, `functions/src/communityRequests.ts`,
 * `features/share/shareStore.ts`, `functions/src/srpRetention.ts`; the Corp Tax
 * Book has no sweep, only `deleteBook` in `functions/src/corpTaxBookStore.ts`),
 * so change one and change the other (`FaqPanel.test.tsx` reads the numbers out
 * of those functions files).
 */
export const RETENTION_GROUPS: readonly RetentionGroup[] = [
  {
    id: 'device',
    titleKey: 'settings.faq.retention.device.title',
    items: [
      'moonTax',
      'ledger',
      'wallet',
      'netWorth',
      'jobs',
      'alerts',
      'esi',
      'lookups',
      'market',
    ].map((id) => ({
      id,
      labelKey: `settings.faq.retention.device.${id}`,
      durationKey: `settings.faq.retention.device.${id}Kept`,
    })),
  },
  {
    id: 'server',
    titleKey: 'settings.faq.retention.server.title',
    items: [
      'synced',
      'deleted',
      'alerts',
      'push',
      'community',
      'communityRequests',
      'shareLinks',
      'srp',
      'corpTaxBook',
      'idle',
    ].map((id) => ({
      id,
      labelKey: `settings.faq.retention.server.${id}`,
      durationKey: `settings.faq.retention.server.${id}Kept`,
    })),
  },
];
