/**
 * What the Local list remembers between pastes, in the generic `esiCache`
 * table under the global sentinel (issue #5812): a pilot's parsed kill history
 * and a pasted name's character id. A paste 15 minutes later then renders from
 * disk and asks zKillboard and ESI only about what is missing or too old,
 * instead of every pilot again.
 *
 * Kill history is shown from disk for up to a day, marked stale once it is
 * older than the window below. Rows are pruned by `esi/cachePrune`.
 */
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import type { KillRecord } from '@/engine/pilotList/killActivity';
import { DAY_MS, MINUTE_MS } from '@/lib/age';

/** Younger than this a stored kill history is used as it is: no request, no stale mark. */
export const KILL_HISTORY_FRESH_MS = 30 * MINUTE_MS;
/** Older than this a stored kill history is not shown as data: the pilot loads again. */
export const KILL_HISTORY_USABLE_MS = DAY_MS;
/** A name -> id answer is reused for a day: a renamed pilot frees their old name. */
export const NAME_ID_FRESH_MS = DAY_MS;

export type KillHistoryAge = 'fresh' | 'stale' | 'expired';

export function classifyKillHistoryAge(ageMs: number): KillHistoryAge {
  if (ageMs < KILL_HISTORY_FRESH_MS) return 'fresh';
  return ageMs < KILL_HISTORY_USABLE_MS ? 'stale' : 'expired';
}

/** What the Threat verdict read beyond the kills, kept so a repeat paste does not ask again. */
export interface StoredExtras {
  dangerRatio: number | null;
  killerRatio: number | null;
  lossTimesMs: number[] | null;
}

export interface StoredKillHistory {
  kills: KillRecord[];
  /** Null until the verdict needed (and got) them. */
  extras: StoredExtras | null;
  fetchedAt: number;
}

const killsKey = (characterId: number) => `pilot-kills:${characterId}`;
const nameKey = (name: string) => `pilot-id:${name.toLowerCase()}`;

/** The stored kill history of each id that has a readable one, with when it was fetched. */
export async function readStoredKillHistories(
  characterIds: readonly number[]
): Promise<Map<number, StoredKillHistory>> {
  const rows = await readCachedEntries<{ kills: KillRecord[]; extras: StoredExtras | null }>(
    GLOBAL_CACHE_CHARACTER_ID,
    characterIds.map(killsKey)
  );
  const found = new Map<number, StoredKillHistory>();
  for (const id of characterIds) {
    const row = rows.get(killsKey(id));
    if (row !== undefined && Array.isArray(row.value?.kills)) {
      found.set(id, {
        kills: row.value.kills,
        extras: row.value.extras ?? null,
        fetchedAt: row.fetchedAt,
      });
    }
  }
  return found;
}

/** Never rejects: a pilot that could not be saved is just fetched again next time. */
export async function storeKillHistory(
  characterId: number,
  kills: readonly KillRecord[],
  fetchedAt: number,
  extras: StoredExtras | null = null
): Promise<void> {
  try {
    await writeCachedMany(
      GLOBAL_CACHE_CHARACTER_ID,
      [[killsKey(characterId), { kills, extras }]],
      fetchedAt
    );
  } catch {
    // Storage full or blocked: the list still shows what was just fetched.
  }
}

export interface PilotNameId {
  id: number;
  name: string;
}

/** Pasted names (lower-cased) -> character, for those answered within `NAME_ID_FRESH_MS`. */
export async function readStoredCharacterIds(
  names: readonly string[],
  now: number
): Promise<Map<string, PilotNameId>> {
  const rows = await readCachedEntries<PilotNameId>(GLOBAL_CACHE_CHARACTER_ID, names.map(nameKey));
  const found = new Map<string, PilotNameId>();
  for (const name of names) {
    const row = rows.get(nameKey(name));
    if (row !== undefined && now - row.fetchedAt < NAME_ID_FRESH_MS) {
      found.set(name.toLowerCase(), row.value);
    }
  }
  return found;
}

/** Never rejects, as `storeKillHistory`. */
export async function storeCharacterIds(
  characters: readonly PilotNameId[],
  fetchedAt: number
): Promise<void> {
  try {
    await writeCachedMany(
      GLOBAL_CACHE_CHARACTER_ID,
      characters.map((c) => [nameKey(c.name), c] as const),
      fetchedAt
    );
  } catch {
    // As above.
  }
}
