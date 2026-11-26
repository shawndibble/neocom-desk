import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import type { KillRecord } from '@/engine/pilotList/killActivity';
import { DAY_MS, MINUTE_MS } from '@/lib/age';

export const KILL_HISTORY_FRESH_MS = 30 * MINUTE_MS;
export const KILL_HISTORY_USABLE_MS = DAY_MS;
export const NAME_ID_FRESH_MS = DAY_MS;

export type KillHistoryAge = 'fresh' | 'stale' | 'expired';

export function classifyKillHistoryAge(ageMs: number): KillHistoryAge {
  if (ageMs < KILL_HISTORY_FRESH_MS) return 'fresh';
  return ageMs < KILL_HISTORY_USABLE_MS ? 'stale' : 'expired';
}

export interface StoredExtras {
  dangerRatio: number | null;
  killerRatio: number | null;
  lossTimesMs: number[] | null;
}

export interface StoredKillHistory {
  kills: KillRecord[];
  extras: StoredExtras | null;
  fetchedAt: number;
}

const killsKey = (characterId: number) => `pilot-kills:${characterId}`;
const nameKey = (name: string) => `pilot-id:${name.toLowerCase()}`;

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
  } catch {}
}

export interface PilotNameId {
  id: number;
  name: string;
}

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
  } catch {}
}
