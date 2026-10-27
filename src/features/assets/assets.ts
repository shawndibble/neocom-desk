/** Fetch + cache layer for the Assets view. */
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

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed separately from a missing/offline result. `truncated` on the
 * cached result means pages were capped or missing.
 */
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

/** One Character's contribution to a fan-out, with how complete it is. */
export interface FannedOutCharacterAssets extends OtherCharacterAssets {
  /** Pages were capped or missing — this Character's list is short, so anything derived from it is a floor. */
  truncated: boolean;
  /** When this Character's list was read from ESI, so a total can say how old it is. */
  fetchedAt?: Date;
  /** This Character's list is the saved copy: ESI could not be reached. */
  fromCache?: boolean;
}

/** A Character whose assets could not be read at all: no scope, nothing cached, or a failed call. */
export interface SkippedCharacterAssets {
  characterId: number;
  name: string;
}

export interface FannedOutAssets {
  entries: FannedOutCharacterAssets[];
  skipped: SkippedCharacterAssets[];
}

/**
 * Cache-or-live per `loadCharacterAssets` for one Character. Null (nothing
 * cached) is skipped by `fanOutAllCharacters`, as is a throw —
 * `loadCharacterAssets` really can reject (a live call that fails outside the
 * stale-grace path) and that must not take the other Characters down.
 *
 * Skips are recorded rather than swallowed: a caller summing quantities across
 * Characters has to be able to say the total is short.
 */
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

/** The Characters whose assets were read, and those that could not be (named, so a view can say who is missing). */
export interface OtherCharactersAssetsRead {
  entries: OtherCharacterAssets[];
  skipped: SkippedCharacterAssets[];
  /** When the oldest saved-copy list was read (ms), or null when every list came from ESI just now. */
  cachedAt: number | null;
}

/**
 * The given Characters' assets, for the Assets page's cross-character
 * `CharacterFilterControl` (issue #746, replacing issue #85's all-or-nothing
 * toggle) — a Character degrades individually rather than failing the whole
 * fetch.
 *
 * A Character with no cached assets and no live answer (offline, ESI down, no
 * scope) drops out of `entries` and is named in `skipped`; without that a view
 * cannot tell "owns no ships" from "their assets didn't load", and says the first.
 */
export async function loadOtherCharactersAssetsDetailed(
  characterIds: readonly number[]
): Promise<OtherCharactersAssetsRead> {
  const ids = new Set(characterIds);
  const characters = await db.characters.toArray();
  const matching = characters.filter((c) => ids.has(c.characterId));
  // Intentionally NO `scope`: the player explicitly picked these Characters in
  // the filter, so a live 403 (and its re-auth banner) is the answer they asked
  // for, unlike the unprompted Build Plan fan-out below.
  const { entries, skipped } = await fanOutAllCharacters({
    characters: matching,
    load: loadFannedOutAssets,
  });
  // Narrowed back to this function's own shape: the filter has no use for the
  // completeness detail, and its callers compare these objects wholesale.
  const cachedTimes = entries.flatMap((e) =>
    e.fromCache && e.fetchedAt ? [e.fetchedAt.getTime()] : []
  );
  return {
    entries: entries.map(({ characterId, name, assets }) => ({ characterId, name, assets })),
    skipped,
    cachedAt: cachedTimes.length > 0 ? Math.min(...cachedTimes) : null,
  };
}

/**
 * Every authenticated Character's assets, active one included, for Build Plan
 * owned-material detection (issue #181). Unlike the Assets page's toggle this
 * has no "active Character" to exclude — detected stock counts what the
 * account owns — and it needs the skipped/truncated detail, because a total
 * summed over an incomplete set must be presented as a lower bound.
 */
export function loadAllCharactersAssets(): Promise<FannedOutAssets> {
  // Scope is pre-checked because this fan-out runs on every Build Plan open
  // rather than behind an explicit toggle, and nothing caches a live 403.
  return fanOutAllCharacters({ scope: ASSETS_SCOPE, load: loadFannedOutAssets });
}
