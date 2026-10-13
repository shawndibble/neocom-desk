export type CommunityTab = 'blueprints' | 'fittings' | 'plans' | 'members' | 'invites';

/** The tabs a `?tab=` link may open on, in the order the bar shows them. */
export const COMMUNITY_TABS: readonly CommunityTab[] = [
  'blueprints',
  'fittings',
  'plans',
  'members',
  'invites',
];
