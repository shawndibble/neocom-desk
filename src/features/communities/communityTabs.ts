export type CommunityTab = 'blueprints' | 'fittings' | 'plans' | 'members';

/** The tabs a `?tab=` link may open on, in the order the bar shows them. */
export const COMMUNITY_TABS: readonly CommunityTab[] = [
  'blueprints',
  'fittings',
  'plans',
  'members',
];

/**
 * The `?tab=` value the admin's Invites had while it was a tab. It now opens
 * Manage › Invites, so an old link still lands on the invite controls.
 */
export const INVITES_TAB_PARAM = 'invites';
