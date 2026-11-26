import type { TFunction } from 'i18next';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getTradeHub } from '@/market/hubs';
import type { HubId } from './characterHubs';

export const PAGE_HUB_AREAS = [
  'fittings',
  'skills',
  'contracts',
  'industry',
  'lpStore',
  'corpSrp',
  'market',
  'appraisal',
  'pi',
  'mining',
  'assets',
  'overview',
] as const;

export type PageHubArea = (typeof PAGE_HUB_AREAS)[number];

const AREA_NAME_KEYS = {
  fittings: 'pageHubs.area.fittings',
  skills: 'pageHubs.area.skills',
  contracts: 'pageHubs.area.contracts',
  industry: 'pageHubs.area.industry',
  lpStore: 'pageHubs.area.lpStore',
  corpSrp: 'pageHubs.area.corpSrp',
  market: 'pageHubs.area.market',
  appraisal: 'pageHubs.area.appraisal',
  pi: 'pageHubs.area.pi',
  mining: 'pageHubs.area.mining',
  assets: 'pageHubs.area.assets',
  overview: 'pageHubs.area.overview',
} as const satisfies Record<PageHubArea, string>;

export function pageHubAreaName(t: TFunction, area: PageHubArea): string {
  return t(AREA_NAME_KEYS[area]);
}
export type PageHubMap = Readonly<Record<string, string>>;

export const PAGE_HUBS_SETTING_KEY = 'sync.pageHubs';

export function parsePageHubs(raw: unknown): PageHubMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [area, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[area] = value;
  }
  return out;
}

export const CLOSEST = 'closest';

export type HubChoice = HubId | typeof CLOSEST;

export function ownChoice(map: PageHubMap, area: PageHubArea): HubChoice | undefined {
  const value = map[area];
  if (value === CLOSEST) return CLOSEST;
  return value !== undefined && getTradeHub(value as HubId) ? (value as HubId) : undefined;
}

export const usePageHubs = createSyncedSetting<PageHubMap>({
  key: PAGE_HUBS_SETTING_KEY,
  defaultValue: {},
  parse: parsePageHubs,
});

export const PARKED_PAGE_HUBS_SETTING_KEY = 'sync.pageHubsParked';

export const useParkedPageHubs = createSyncedSetting<PageHubMap>({
  key: PARKED_PAGE_HUBS_SETTING_KEY,
  defaultValue: {},
  parse: parsePageHubs,
});

export function setPageHub(map: PageHubMap, area: PageHubArea, hub: HubChoice): PageHubMap {
  return { ...map, [area]: hub };
}

export function dropPageHub(map: PageHubMap, area: PageHubArea): PageHubMap {
  if (!(area in map)) return map;
  const rest = { ...map };
  delete rest[area];
  return rest;
}

export function pageHubEntry(area: PageHubArea): HubChoice | undefined {
  return ownChoice(usePageHubs.getState().value, area);
}
