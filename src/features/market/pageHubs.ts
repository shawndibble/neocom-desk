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
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getTradeHub } from '@/market/hubs';
import type { HubId } from './characterHubs';

/**
 * The page areas a pilot can give a hub of their own, in the order Settings
 * lists them. An area joins once its pages read `useHubFor` (issue #6523 moves
 * them one slice at a time), so Settings never offers an entry that does
 * nothing; an entry for an area this build does not list is dropped on parse.
 */
export const PAGE_HUB_AREAS = ['contracts'] as const;

export type PageHubArea = (typeof PAGE_HUB_AREAS)[number];
export type PageHubMap = Readonly<Partial<Record<PageHubArea, HubId>>>;

export const PAGE_HUBS_SETTING_KEY = 'sync.pageHubs';

function isPageHubArea(key: string): key is PageHubArea {
  return (PAGE_HUB_AREAS as readonly string[]).includes(key);
}

/**
 * A stored map. Pulled from other devices, maybe newer builds, so an unknown
 * area or hub is dropped on its own: that page falls back to Global here.
 */
export function parsePageHubs(raw: unknown): PageHubMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Partial<Record<PageHubArea, HubId>> = {};
  for (const [area, hub] of Object.entries(raw)) {
    if (!isPageHubArea(area)) continue;
    if (typeof hub !== 'string' || !getTradeHub(hub as HubId)) continue;
    out[area] = hub as HubId;
  }
  return out;
}

export const usePageHubs = createSyncedSetting<PageHubMap>({
  key: PAGE_HUBS_SETTING_KEY,
  defaultValue: {},
  parse: parsePageHubs,
});

export function resolvePageHub(map: PageHubMap, area: PageHubArea, globalHub: HubId): HubId {
  return map[area] ?? globalHub;
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
