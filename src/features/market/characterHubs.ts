/**
 * A Trade Hub per Character (issue #5593): `sync.marketHubByCharacter`, one
 * synced map `characterId -> hub id`, last write wins like every synced
 * setting. `sync.marketHub` stays the account default and is what a Character
 * with no entry uses, so upgrading changes nothing until a pilot edits.
 *
 * The edits below are pure. Callers hand them the current map and the ids of
 * the Characters on this device; a map entry for a Character this device does
 * not hold (another device's) is always kept, never pruned by the local roster.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { getTradeHub, type TradeHub } from '@/market/hubs';

export type HubId = TradeHub['id'];
export type HubMap = Readonly<Record<number, HubId>>;

export const HUB_BY_CHARACTER_SETTING_KEY = 'sync.marketHubByCharacter';

/** A stored map. Pulled from other devices (maybe older builds), so bad entries go one by one. */
export function parseHubMap(raw: unknown): HubMap | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<number, HubId> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (typeof value !== 'string' || !getTradeHub(value as HubId)) continue;
    out[id] = value as HubId;
  }
  return out;
}

export const useHubByCharacter = createSyncedSetting<HubMap>({
  key: HUB_BY_CHARACTER_SETTING_KEY,
  defaultValue: {},
  parse: parseHubMap,
});

export function resolveTradeHub(map: HubMap, characterId: number | null, defaultHub: HubId): HubId {
  return (characterId !== null ? map[characterId] : undefined) ?? defaultHub;
}

export function setCharacterHub(map: HubMap, characterId: number, hub: HubId): HubMap {
  return { ...map, [characterId]: hub };
}

export function dropCharacterHub(map: HubMap, characterId: number): HubMap {
  if (!(characterId in map)) return map;
  const rest: Record<number, HubId> = { ...map };
  delete rest[characterId];
  return rest;
}

/** Entries for local Characters that lack one, at `hub`: run before the default changes. */
export function fillMissingHubs(map: HubMap, characterIds: readonly number[], hub: HubId): HubMap {
  const next: Record<number, HubId> = { ...map };
  for (const id of characterIds) next[id] ??= hub;
  return next;
}

export function applyDefaultToAll(
  map: HubMap,
  characterIds: readonly number[],
  hub: HubId
): HubMap {
  const next: Record<number, HubId> = { ...map };
  for (const id of characterIds) next[id] = hub;
  return next;
}

/** Hubs the given Characters resolve to with how many are on each, most first. */
export function hubCounts(
  map: HubMap,
  characterIds: readonly number[],
  defaultHub: HubId
): [HubId, number][] {
  const counts = new Map<HubId, number>();
  for (const id of characterIds) {
    const hub = resolveTradeHub(map, id, defaultHub);
    counts.set(hub, (counts.get(hub) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
