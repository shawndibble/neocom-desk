import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  loadPaginatedWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { fanOutAllCharacters } from '@/features/character/allCharactersFanOut';

const ASSETS_SCOPE = ESI_REGISTRY.getCharacterAssets.scope;

export const KEY = 'assets';

export function loadCharacterAssets(characterId: number): Promise<StatusResult<CharacterAsset[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterAssets(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

export interface OtherCharacterAssets {
  characterId: number;
  name: string;
  assets: CharacterAsset[];
}

export interface FannedOutCharacterAssets extends OtherCharacterAssets {
  truncated: boolean;
  fetchedAt?: Date;
  fromCache?: boolean;
}

export interface SkippedCharacterAssets {
  characterId: number;
  name: string;
}

export interface FannedOutAssets {
  entries: FannedOutCharacterAssets[];
  skipped: SkippedCharacterAssets[];
}

async function loadFannedOutAssets(character: {
  characterId: number;
  name: string;
}): Promise<FannedOutCharacterAssets | null> {
  const { characterId, name } = character;
  const { cached } = await loadCharacterAssets(characterId);
  if (!cached) return null;
  return {
    characterId,
    name,
    assets: cached.data,
    truncated: cached.truncated,
    fetchedAt: cached.fetchedAt,
    fromCache: cached.fromCache,
  };
}

export interface OtherCharactersAssetsRead {
  entries: OtherCharacterAssets[];
  skipped: SkippedCharacterAssets[];
  cachedAt: number | null;
}

export async function loadOtherCharactersAssetsDetailed(
  characterIds: readonly number[]
): Promise<OtherCharactersAssetsRead> {
  const ids = new Set(characterIds);
  const characters = await db.characters.toArray();
  const matching = characters.filter((c) => ids.has(c.characterId));
  const { entries, skipped } = await fanOutAllCharacters({
    characters: matching,
    load: loadFannedOutAssets,
  });
  const cachedTimes = entries.flatMap((e) =>
    e.fromCache && e.fetchedAt ? [e.fetchedAt.getTime()] : []
  );
  return {
    entries: entries.map(({ characterId, name, assets }) => ({ characterId, name, assets })),
    skipped,
    cachedAt: cachedTimes.length > 0 ? Math.min(...cachedTimes) : null,
  };
}

export function loadAllCharactersAssets(): Promise<FannedOutAssets> {
  return fanOutAllCharacters({ scope: ASSETS_SCOPE, load: loadFannedOutAssets });
}
