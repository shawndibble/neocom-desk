import { enumParam } from '@/lib/urlState';

export const OPPORTUNITIES_SORT_KEY = 'opps.sort';
export const OPPORTUNITIES_DEFAULT_SORT = { columnId: 'iskPerHour', direction: 'desc' } as const;

export const OWNED_SORT_KEY = 'opps.ownedSort';
export const OWNED_DEFAULT_SORT = { columnId: 'blueprint', direction: 'asc' } as const;

export const OPPORTUNITIES_ACTIVITY_KEY = 'opps.activity';
const ACTIVITY_FILTERS = ['all', 'manufacturing', 'reaction'] as const;
export type OpportunitiesActivityFilter = (typeof ACTIVITY_FILTERS)[number];
export const OPPORTUNITIES_ACTIVITY_PARAM = enumParam(ACTIVITY_FILTERS, 'all');
