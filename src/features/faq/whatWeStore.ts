import type { SyncedFaqItemId } from '@/sync/syncedCollections';

export interface WhatWeStoreItem {
  id: string;
  labelKey: string;
  noteKey?: string;
  detailKeys?: readonly string[];
}

interface SyncedWhatWeStoreItem extends WhatWeStoreItem {
  id: SyncedFaqItemId;
}

export interface WhatWeStoreGroup {
  id: string;
  titleKey: string;
  descriptionKey: string;
  items: readonly WhatWeStoreItem[];
}

export type CommunityFaqItemId =
  'membership' | 'blueprints' | 'fittings' | 'plans' | 'requests' | 'payouts' | 'pledges' | 'mail';

export const COMMUNITY_COLLECTION_FAQ_ITEM = {
  members: 'membership',
  library: 'blueprints',
  requests: 'membership',
  mailInvites: 'membership',
  itemRequests: 'requests',
  boardVersion: 'requests',
  fleetPayouts: 'payouts',
  shares: 'payouts',
  pledges: 'pledges',
  pledgeMails: 'mail',
  fittings: 'fittings',
  skillPlans: 'plans',
  communities: 'membership',
  mailInviteQuota: 'mail',
  requestMailQuota: 'mail',
  popSharingBlocks: 'membership',
} as const satisfies Record<string, CommunityFaqItemId>;

export type CorpFaqItemId = 'srp' | 'corpTaxBook' | 'vetting';

export const CORP_COLLECTION_FAQ_ITEM = {
  officers: 'corpTaxBook',
  observed: 'corpTaxBook',
  payments: 'corpTaxBook',
  lateNotices: 'corpTaxBook',
  lateNoticeLinks: 'corpTaxBook',
  accounts: 'corpTaxBook',
  dismissals: 'corpTaxBook',
  miners: 'corpTaxBook',
  moonDocs: 'corpTaxBook',
  readModels: 'corpTaxBook',
  feeders: 'corpTaxBook',
  feederViews: 'corpTaxBook',
  adjustments: 'corpTaxBook',
  writeOffs: 'corpTaxBook',
  toleranceExemptions: 'corpTaxBook',
  minerPaid: 'corpTaxBook',
  feederCoverage: 'corpTaxBook',
  extractions: 'corpTaxBook',
  declarations: 'corpTaxBook',
  disputes: 'corpTaxBook',
  rebills: 'corpTaxBook',
  meta: 'corpTaxBook',
  audit: 'corpTaxBook',
  srp: 'srp',
  srpClaims: 'srp',
  srpDoctrines: 'srp',
  srpAudit: 'srp',
  srpOfficers: 'srp',
  vetting: 'vetting',
  vettingReviews: 'vetting',
  inputs: 'vetting',
  rawRows: 'vetting',
  vettingThrottle: 'vetting',
} as const satisfies Record<string, CorpFaqItemId>;

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
      { id: 'characterAccelerators', labelKey: 'settings.faq.store.synced.characterAccelerators' },
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
      { id: 'contractHistory', labelKey: 'settings.faq.store.local.contractHistory' },
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
    id: 'corpRecords',
    titleKey: 'settings.faq.store.corp.title',
    descriptionKey: 'settings.faq.store.corp.description',
    items: (['srp', 'corpTaxBook', 'vetting'] satisfies CorpFaqItemId[]).map((id) => ({
      id,
      labelKey: `settings.faq.store.corp.${id}`,
    })),
  },
];

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

export const RETENTION_GROUPS: readonly RetentionGroup[] = [
  {
    id: 'device',
    titleKey: 'settings.faq.retention.device.title',
    items: [
      'moonTax',
      'ledger',
      'wallet',
      'contracts',
      'netWorth',
      'jobs',
      'alerts',
      'esi',
      'lookups',
      'mailBodies',
      'mailDrafts',
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
      'vetting',
      'idle',
    ].map((id) => ({
      id,
      labelKey: `settings.faq.retention.server.${id}`,
      durationKey: `settings.faq.retention.server.${id}Kept`,
    })),
  },
];
