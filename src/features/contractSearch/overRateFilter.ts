export const OVER_RATE_FILTERS = ['all', 'only', 'hide'] as const;
export type OverRateFilter = (typeof OVER_RATE_FILTERS)[number];
