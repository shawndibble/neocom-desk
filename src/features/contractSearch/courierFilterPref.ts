/**
 * Contracts Search's Courier filter values, remembered across visits (issue
 * #1719): hull volume and collateral ceiling are the two fields a regular
 * hauler resets every session — about 6 taps and 16 digits — so a bare
 * `/contracts` visit restores the whole filter rather than one field.
 *
 * Deliberately absent:
 * - **The free-text route search** (`courier.q`) — a stale typed query
 *   silently narrowing a fresh visit is a search box's own bad habit, not
 *   the numeric/chip filters this issue is about.
 * - **Route preference** (`courier.pref`) — `CourierResults.tsx`'s own
 *   comment on `ROUTE_PREFERENCES` already rules out persisting it before
 *   its vocabulary is unified with the Assets page's `RoutePreference`.
 *
 * One record, rejected as a whole if any field is unusable — same rule
 * `pi/planControlsPref.ts` and `market/locationMode.ts` follow for a combined
 * setting: a half-restored filter is worse than a fully default one.
 *
 * URL wins whenever present (decision `20260922-221531` / ADR 0015): this
 * setting is consulted only for the fields a fresh page load's URL leaves
 * unset. `CourierResults.tsx` checks each key's raw presence in the query
 * string itself — nothing here ever mirrors a stored value back into the
 * URL, and this is written to only from an actual filter change.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { OVER_RATE_FILTERS, type OverRateFilter } from './overRateFilter';

export const COURIER_FILTER_SETTING_KEY = 'contractSearchCourierFilter';

export interface StoredCourierFilter {
  originRegionId: number | null;
  destinationRegionId: number | null;
  destinationSpace: readonly SpaceKind[];
  hideUncompletable: boolean;
  overRate: OverRateFilter;
  minReward: string;
  maxCollateral: string;
  maxVolume: string;
  minDays: string;
}

/** No restriction at all — the same filter a hauler who has never touched the board sees. */
export const DEFAULT_COURIER_FILTER: StoredCourierFilter = {
  originRegionId: null,
  destinationRegionId: null,
  destinationSpace: SPACE_KINDS,
  hideUncompletable: false,
  overRate: 'all',
  minReward: '',
  maxCollateral: '',
  maxVolume: '',
  minDays: '',
};

function isSpaceKind(raw: unknown): raw is SpaceKind {
  return typeof raw === 'string' && (SPACE_KINDS as readonly string[]).includes(raw);
}

function isOverRateFilter(raw: unknown): raw is OverRateFilter {
  return typeof raw === 'string' && (OVER_RATE_FILTERS as readonly string[]).includes(raw);
}

export function parseStoredCourierFilter(raw: unknown): StoredCourierFilter | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.originRegionId !== null && typeof r.originRegionId !== 'number') return null;
  if (r.destinationRegionId !== null && typeof r.destinationRegionId !== 'number') return null;
  if (!Array.isArray(r.destinationSpace) || !r.destinationSpace.every(isSpaceKind)) return null;
  if (typeof r.hideUncompletable !== 'boolean') return null;
  if (!isOverRateFilter(r.overRate)) return null;
  if (typeof r.minReward !== 'string') return null;
  if (typeof r.maxCollateral !== 'string') return null;
  if (typeof r.maxVolume !== 'string') return null;
  if (typeof r.minDays !== 'string') return null;
  return {
    originRegionId: r.originRegionId as number | null,
    destinationRegionId: r.destinationRegionId as number | null,
    destinationSpace: r.destinationSpace as SpaceKind[],
    hideUncompletable: r.hideUncompletable,
    overRate: r.overRate,
    minReward: r.minReward,
    maxCollateral: r.maxCollateral,
    maxVolume: r.maxVolume,
    minDays: r.minDays,
  };
}

export const useCourierFilterPref = createLocalSetting<StoredCourierFilter>({
  key: COURIER_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_COURIER_FILTER,
  parse: parseStoredCourierFilter,
});
