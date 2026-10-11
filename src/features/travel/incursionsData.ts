/**
 * The public `/incursions` feed for Route Safety's "Incursions near you"
 * (issue #3540), cached to ESI's own expiry like the kill and jump feeds, and
 * the constellation names its rows need (the bundled snapshot has none).
 */
import type { IncursionEntry } from '@/engine/incursions/incursionRows';
import { conditionalFetch, GLOBAL_CACHE_CHARACTER_ID, loadWithCache } from '@/esi/cache';
import { getIncursions, postUniverseNames } from '@/esi/endpoints';
import { createLocalSetting } from '@/lib/useLocalSetting';

const CACHE_KEY = 'incursions';

/** Whether Route Safety's Incursions panel is open, per device. Folded until the pilot opens it. */
export const useIncursionsPanelOpen = createLocalSetting<boolean>({
  key: 'routeIncursionsOpen',
  defaultValue: false,
});

export interface IncursionsFeed {
  entries: IncursionEntry[];
}

/** `null` when the feed could not be read and nothing was cached: an unread feed is not "no incursions". */
export async function loadIncursions(): Promise<IncursionsFeed | null> {
  const { fetchLive, conditional } = conditionalFetch<IncursionEntry[]>((options) =>
    getIncursions(options)
  );
  const result = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchLive, {
    conditional,
  }).catch(() => null);
  return result ? { entries: result.data } : null;
}

/** Names never change, so one lookup per constellation per session is enough. */
const constellationNames = new Map<number, string>();

/** A constellation ESI cannot name is simply absent; the row falls back to its staging system. */
export async function loadConstellationNames(
  ids: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  const missing = [...new Set(ids)].filter((id) => !constellationNames.has(id));
  if (missing.length > 0) {
    const resolved = await postUniverseNames(missing).catch(() => []);
    for (const entry of resolved) constellationNames.set(entry.id, entry.name);
  }
  return new Map(
    ids.flatMap((id) => {
      const name = constellationNames.get(id);
      return name === undefined ? [] : [[id, name] as const];
    })
  );
}
