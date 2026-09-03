/** Fetch + cache layer for the Assets view. */
import { getCharacterAssets, type CharacterAsset } from '@/esi/endpoints';
import { loadPaginatedWithCacheStatus, type StatusResult } from '@/esi/cache';
import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

const KEY = 'assets';

/**
 * Assets (up to MAX_ASSET_PAGES worth). ESI or cache, with the auth-failure
 * state exposed separately from a missing/offline result. `truncated` on the
 * cached result means pages were capped or missing.
 */
export function loadCharacterAssets(characterId: number): Promise<StatusResult<CharacterAsset[]>> {
  return loadPaginatedWithCacheStatus(characterId, KEY, () => getCharacterAssets(characterId));
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
 * The shared per-Character fan-out: cache-or-live per `loadCharacterAssets`,
 * capped concurrency like `roster.ts`'s live mode.
 *
 * A Character that never granted the assets scope, or whose live call fails
 * with nothing cached, is skipped rather than failing the whole fan-out — and
 * a throw is caught here for the same reason. `loadCharacterAssets` really can
 * reject (a live call that fails outside the stale-grace path), and
 * `mapWithConcurrencyLimit` awaits its callback directly, so an uncaught
 * rejection would take every other Character down with it.
 *
 * Skips are recorded rather than swallowed: a caller summing quantities across
 * Characters has to be able to say the total is short.
 */
async function fanOutCharacterAssets(
  characters: readonly { characterId: number; name: string }[]
): Promise<FannedOutAssets> {
  const entries: FannedOutCharacterAssets[] = [];
  const skipped: SkippedCharacterAssets[] = [];
  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const { characterId, name } = character;
    try {
      const { cached } = await loadCharacterAssets(characterId);
      if (cached) {
        entries.push({ characterId, name, assets: cached.data, truncated: cached.truncated });
      } else {
        skipped.push({ characterId, name });
      }
    } catch {
      skipped.push({ characterId, name });
    }
  });
  return { entries, skipped };
}

/**
 * Every OTHER authenticated Character's assets, for the Assets page's
 * cross-character search toggle (issue #85) — the toggle degrades per
 * Character rather than failing as a whole.
 */
export async function loadOtherCharactersAssets(
  activeCharacterId: number
): Promise<OtherCharacterAssets[]> {
  const characters = await db.characters.toArray();
  const others = characters.filter((c) => c.characterId !== activeCharacterId);
  const { entries } = await fanOutCharacterAssets(others);
  // Narrowed back to this function's own shape: the toggle has no use for the
  // completeness detail, and its callers compare these objects wholesale.
  return entries.map(({ characterId, name, assets }) => ({ characterId, name, assets }));
}

/**
 * Every authenticated Character's assets, active one included, for Build Plan
 * owned-material detection (issue #181). Unlike the Assets page's toggle this
 * has no "active Character" to exclude — detected stock counts what the
 * account owns — and it needs the skipped/truncated detail, because a total
 * summed over an incomplete set must be presented as a lower bound.
 */
export async function loadAllCharactersAssets(): Promise<FannedOutAssets> {
  return fanOutCharacterAssets(await db.characters.toArray());
}
