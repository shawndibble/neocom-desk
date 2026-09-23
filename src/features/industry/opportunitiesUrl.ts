/**
 * Build Opportunities' table sort in the URL (ADR 0015). Shared by
 * `OpportunitiesPanel`'s desktop table and `MobileOpportunityList` — only one
 * renders at a time, so one key serves both.
 */
export const OPPORTUNITIES_SORT_KEY = 'opps.sort';
export const OPPORTUNITIES_DEFAULT_SORT = { columnId: 'iskPerHour', direction: 'desc' } as const;
