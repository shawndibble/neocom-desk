/**
 * Page hubs (issue #6523): a Trade Hub for one page area, overriding the
 * Global hub (`useMarketHub`) there only. `sync.pageHubs` is one synced map
 * `area -> hub id`, account-wide, last write wins like every synced setting.
 * A page with no entry prices at the Global hub, so with an empty map every
 * page prices exactly as before; whether an entry exists is the whole state —
 * there is no separate "use the page's hub" flag to disagree with it.
 *
 * Removing an entry rewrites the map without it, never deletes the key. The
 * edits below are pure; the store-touching actions live in `hub.ts`, beside
 * the Global hub they fall back to.
 */
import type { TFunction } from 'i18next';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getTradeHub } from '@/market/hubs';
import type { HubId } from './characterHubs';

/**
 * The page areas a pilot can give a hub of their own, in the order Settings
 * lists them. An area joins once its pages read `useHubFor` (issue #6523 moves
 * them one slice at a time), so Settings never offers an entry that does
 * nothing; an entry for an area this build does not list is dropped on parse.
 */
export const PAGE_HUB_AREAS = [
  'fittings',
  'skills',
  'contracts',
  'industry',
  'lpStore',
  'corpSrp',
  'market',
  'appraisal',
] as const;

export type PageHubArea = (typeof PAGE_HUB_AREAS)[number];

/** Each area's player-facing name, as literal keys so a dead-key scan sees them. */
const AREA_NAME_KEYS = {
  fittings: 'pageHubs.area.fittings',
  skills: 'pageHubs.area.skills',
  contracts: 'pageHubs.area.contracts',
  industry: 'pageHubs.area.industry',
  lpStore: 'pageHubs.area.lpStore',
  corpSrp: 'pageHubs.area.corpSrp',
  market: 'pageHubs.area.market',
  appraisal: 'pageHubs.area.appraisal',
} as const satisfies Record<PageHubArea, string>;

export function pageHubAreaName(t: TFunction, area: PageHubArea): string {
  return t(AREA_NAME_KEYS[area]);
}
/**
 * The stored map, as stored: `area -> value`. Read an area through `ownHub`,
 * never by indexing, since a key or value this build does not know (a newer
 * build's area, a future value such as Closest) is kept as it came.
 */
export type PageHubMap = Readonly<Record<string, string>>;

export const PAGE_HUBS_SETTING_KEY = 'sync.pageHubs';

/**
 * A stored map. Pulled from other devices, maybe newer builds, so an entry
 * this build cannot use is **kept**, not dropped: the map is written back
 * whole on the next edit, and dropping it would erase a newer build's entry
 * on every device. Only a non-string value is discarded. `ownHub` decides what
 * an entry means here; one it cannot read leaves that page on Global.
 */
export function parsePageHubs(raw: unknown): PageHubMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [area, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[area] = value;
  }
  return out;
}

/** `area`'s own hub, when its entry names a Trade Hub this build knows; else `undefined` (Global). */
export function ownHub(map: PageHubMap, area: PageHubArea): HubId | undefined {
  const value = map[area];
  return value !== undefined && getTradeHub(value as HubId) ? (value as HubId) : undefined;
}

export const usePageHubs = createSyncedSetting<PageHubMap>({
  key: PAGE_HUBS_SETTING_KEY,
  defaultValue: {},
  parse: parsePageHubs,
});

export function resolvePageHub(map: PageHubMap, area: PageHubArea, globalHub: HubId): HubId {
  return ownHub(map, area) ?? globalHub;
}

export function setPageHub(map: PageHubMap, area: PageHubArea, hub: HubId): PageHubMap {
  return { ...map, [area]: hub };
}

export function dropPageHub(map: PageHubMap, area: PageHubArea): PageHubMap {
  if (!(area in map)) return map;
  const rest = { ...map };
  delete rest[area];
  return rest;
}

/**
 * `area`'s own entry right now, `undefined` on Global (or before page hubs
 * are read): for non-React code that only differs from today with an entry.
 */
export function pageHubEntry(area: PageHubArea): HubId | undefined {
  return ownHub(usePageHubs.getState().value, area);
}
