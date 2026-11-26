export type CommunityTab = 'blueprints' | 'fittings' | 'plans' | 'requests' | 'payouts' | 'members';

export type ContentTab = Exclude<CommunityTab, 'requests' | 'payouts' | 'members'>;

export const isContentTab = (tab: CommunityTab): tab is ContentTab =>
  tab !== 'requests' && tab !== 'payouts' && tab !== 'members';

export const COMMUNITY_TABS: readonly CommunityTab[] = [
  'blueprints',
  'fittings',
  'plans',
  'requests',
  'payouts',
  'members',
];

export const INVITES_TAB_PARAM = 'invites';

export const MINE_VIEW_PARAM = 'mine';
