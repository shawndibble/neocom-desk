export type CommunityTab = 'blueprints' | 'fittings' | 'plans' | 'requests' | 'payouts' | 'members';

/** The Community tabs that hold shared content, each with its own My sharing. */
export type ContentTab = Exclude<CommunityTab, 'requests' | 'payouts' | 'members'>;

export const isContentTab = (tab: CommunityTab): tab is ContentTab =>
  tab !== 'requests' && tab !== 'payouts' && tab !== 'members';

/** The tabs a `?tab=` link may open on, in the order the bar shows them. */
export const COMMUNITY_TABS: readonly CommunityTab[] = [
  'blueprints',
  'fittings',
  'plans',
  'requests',
  'payouts',
  'members',
];

/**
 * The `?tab=` value the admin's Invites had while it was a tab. It now opens
 * Manage › Invites, so an old link still lands on the invite controls.
 */
export const INVITES_TAB_PARAM = 'invites';

/**
 * `?view=mine` opened the old Mine view of the tab it came with. It now opens
 * that tab's My sharing, so an old link still lands on the share controls.
 */
export const MINE_VIEW_PARAM = 'mine';
