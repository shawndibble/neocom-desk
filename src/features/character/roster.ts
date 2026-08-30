/**
 * Phase 1 shared multi-Character loader (docs/plans/evelens-parity/briefs/
 * C-overview-multichar.md, "Shared mechanism"). Consumers: items 02 (queue
 * health across characters), 07 (skill comparison), 09 (overview groups).
 *
 * This is a convenience layer over already-shipped capability, not new
 * infrastructure: `configureEsi`'s `getToken` is already parameterized per
 * `characterId` (src/esi/client.ts), and `routes/Characters.tsx` already fans
 * out per-character loads concurrently. Nothing here talks to ESI directly —
 * cache-only mode reads Dexie only; live mode composes the existing
 * per-character read-through loaders (docs/ARCHITECTURE.md §7 step 3: never
 * reimplement read-through).
 */
import { db } from '@/db';
import { isCachePurgePending } from '@/esi/cachePurge';
import type { CachedResult } from '@/esi/cache';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadWalletBalance, KEYS as WALLET_KEYS } from './wallet';
import {
  loadCharacterSkills,
  loadCharacterSkillQueue,
  KEYS as SKILLS_KEYS,
} from '@/features/skills/data';

export interface RosterEntry {
  characterId: number;
  name: string;
  wallet: CachedResult<number> | null;
  skills: CachedResult<CharacterSkills> | null;
  queue: CachedResult<SkillQueueEntry[]> | null;
}

/**
 * Cache keys reused directly from the owning modules' exported `KEYS` maps
 * (`src/features/character/wallet.ts`, `src/features/skills/data.ts`) so the
 * literal strings cannot drift out from under this loader.
 */
const CACHE_KEYS = {
  wallet: WALLET_KEYS.balance,
  skills: SKILLS_KEYS.skills,
  queue: SKILLS_KEYS.skillqueue,
} as const;

/**
 * Batch-reads one cache key for every given character.
 *
 * Uses `db.esiCache.bulkGet` against the compound primary key `[characterId,
 * key]` — `esiCache` has no secondary index on `key` alone (`src/db/index.ts`:
 * `esiCache: '[characterId+key]'`), so `db.esiCache.where('key').equals(...)`
 * does not work. `bulkGet` against the compound PK does, with no Dexie schema
 * bump.
 *
 * PRIVACY GATE: `src/esi/cache.ts`'s `readCachedRow` is documented as "the
 * single point where a cached row is allowed to reach a caller," gated on
 * `isCachePurgePending` — a character whose cache purge could not be
 * completed (repo defect D1: a previous owner's cached wallet surviving a
 * character sale) must read as having nothing cached. A raw `bulkGet` bypasses
 * that gate entirely, which would reopen D1 for this loader. This function
 * therefore re-checks `isCachePurgePending` per character after the bulk read
 * and drops any row for a pending character, rather than calling
 * `readCachedRow`/`readCached` in a loop (which would defeat the point of
 * batching).
 */
async function bulkReadCached<T>(
  characterIds: readonly number[],
  key: string
): Promise<Map<number, CachedResult<T>>> {
  const result = new Map<number, CachedResult<T>>();
  if (characterIds.length === 0) return result;

  const rows = await db.esiCache.bulkGet(characterIds.map((id): [number, string] => [id, key]));
  const pending = await Promise.all(characterIds.map((id) => isCachePurgePending(id)));

  rows.forEach((row, i) => {
    if (!row || pending[i]) return; // no row, or purge pending: must not serve (see doc above)
    result.set(characterIds[i], {
      data: row.value as T,
      fetchedAt: new Date(row.fetchedAt),
      fromCache: true,
      truncated: row.truncated === true,
    });
  });

  return result;
}

/** Cache-only: no ESI calls, batch-reads whatever is already in Dexie. */
async function loadCacheOnly(): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];

  const ids = characters.map((c) => c.characterId);
  const [wallets, skills, queues] = await Promise.all([
    bulkReadCached<number>(ids, CACHE_KEYS.wallet),
    bulkReadCached<CharacterSkills>(ids, CACHE_KEYS.skills),
    bulkReadCached<SkillQueueEntry[]>(ids, CACHE_KEYS.queue),
  ]);

  return characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    // Not fetched / no cache row -> null, distinct from a fetched-but-empty
    // value. Downstream deriveQueueHealth (item 02) depends on telling
    // "unknown" from "empty queue" apart; collapsing them here would be wrong.
    wallet: wallets.get(c.characterId) ?? null,
    skills: skills.get(c.characterId) ?? null,
    queue: queues.get(c.characterId) ?? null,
  }));
}

/**
 * `live: true`: refreshes every character via the existing per-character
 * ESI-or-cache loaders, capped at `ESI_FANOUT_CONCURRENCY` characters in
 * flight at once (each character's 3 loaders run concurrently with each
 * other, so up to `ESI_FANOUT_CONCURRENCY * 3` requests in flight — the cap
 * is on characters, not on each individual call site).
 *
 * One character's loader throwing must not sink the whole snapshot: each
 * loader call is awaited via `Promise.allSettled`, so a rejection just leaves
 * that field `null` for that character instead of rejecting the worker (which
 * would otherwise propagate up through `mapWithConcurrencyLimit`'s
 * `Promise.all` and fail every other character too).
 */
async function loadLive(): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];

  const entries: RosterEntry[] = characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    wallet: null,
    skills: null,
    queue: null,
  }));

  await mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const [wallet, skills, queue] = await Promise.allSettled([
      loadWalletBalance(entry.characterId),
      loadCharacterSkills(entry.characterId),
      loadCharacterSkillQueue(entry.characterId),
    ]);
    if (wallet.status === 'fulfilled') entry.wallet = wallet.value;
    if (skills.status === 'fulfilled') entry.skills = skills.value;
    if (queue.status === 'fulfilled') entry.queue = queue.value;
  });

  return entries;
}

/** Cache-only by default (no live ESI call); `live: true` refreshes with capped concurrency. */
export function loadRosterSnapshot(opts?: { live?: boolean }): Promise<RosterEntry[]> {
  return opts?.live ? loadLive() : loadCacheOnly();
}
