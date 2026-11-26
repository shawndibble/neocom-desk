import type { IncursionEntry } from '@/engine/incursions/incursionRows';
import { conditionalFetch, GLOBAL_CACHE_CHARACTER_ID, loadWithCache } from '@/esi/cache';
import { getIncursions } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { createLocalSetting } from '@/lib/useLocalSetting';

const CACHE_KEY = 'incursions';

export const useIncursionsPanelOpen = createLocalSetting<boolean>({
  key: 'routeIncursionsOpen',
  defaultValue: false,
});

export interface IncursionsFeed {
  entries: IncursionEntry[];
}

export async function loadIncursions(): Promise<IncursionsFeed | null> {
  const { fetchLive, conditional } = conditionalFetch<IncursionEntry[]>((options) =>
    getIncursions(options)
  );
  const result = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchLive, {
    conditional,
  }).catch(() => null);
  return result ? { entries: result.data } : null;
}

const constellationNames = new Map<number, string>();

export async function loadConstellationNames(
  ids: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  const missing = [...new Set(ids)].filter((id) => !constellationNames.has(id));
  if (missing.length > 0) {
    const resolved = await resolveNames(missing).catch(() => new Map<number, string>());
    for (const [id, name] of resolved) constellationNames.set(id, name);
  }
  return new Map(
    ids.flatMap((id) => {
      const name = constellationNames.get(id);
      return name === undefined ? [] : [[id, name] as const];
    })
  );
}
