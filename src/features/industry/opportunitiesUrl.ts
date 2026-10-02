/**
 * Build Opportunities' table sort in the URL (ADR 0015). Shared by
 * `OpportunitiesPanel`'s desktop table and `MobileOpportunityList` — only one
 * renders at a time, so one key serves both.
 */
export const OPPORTUNITIES_SORT_KEY = 'opps.sort';
export const OPPORTUNITIES_DEFAULT_SORT = { columnId: 'iskPerHour', direction: 'desc' } as const;

/** "All owned" (issue #2335) keeps its own sort, shared by the desktop table and the phone cards. */
export const OWNED_SORT_KEY = 'opps.ownedSort';
export const OWNED_DEFAULT_SORT = { columnId: 'blueprint', direction: 'asc' } as const;
