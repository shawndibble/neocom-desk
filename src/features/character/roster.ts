/**
 * Every Character at once. A convenience layer, not new infrastructure:
 * `getToken` is already per-`characterId` (esi/client.ts). Nothing here talks
 * to ESI directly — cache-only reads Dexie; live composes the existing
 * per-character read-through loaders (docs/ARCHITECTURE.md §7 step 3: never
 * reimplement read-through).
 */
import { db, type CharacterRecord } from '@/db';
import { readCachedRows, type CachedResult } from '@/esi/cache';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { completedQueueLevels, completedSpGain } from '@/features/skills/queueStatus';
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
  /**
   * total_sp corrected for queue entries /skills has not caught up to yet —
   * null when there's no cached/fetched skills row at all. Applied here
   * (not baked into `skills`) so both read paths below get it without either
   * one calling the corrected-skills loader, which would refetch instead of
   * reusing the wallet/skills/queue rows this function already gathered.
   */
  correctedTotalSp: number | null;
}

/** From the owners' exported `KEYS`, so the literal strings cannot drift. */
const CACHE_KEYS = {
  wallet: WALLET_KEYS.balance,
  skills: SKILLS_KEYS.skills,
  queue: SKILLS_KEYS.skillqueue,
} as const;

async function loadCacheOnly(characters: readonly CharacterRecord[]): Promise<RosterEntry[]> {
  const ids = characters.map((c) => c.characterId);
  const [wallets, skills, queues] = await Promise.all([
    readCachedRows<number>(ids, CACHE_KEYS.wallet),
    readCachedRows<CharacterSkills>(ids, CACHE_KEYS.skills),
    readCachedRows<SkillQueueEntry[]>(ids, CACHE_KEYS.queue),
  ]);

  return characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    // No cache row -> null, distinct from a fetched-but-empty value:
    // consumers must be able to tell "unknown" from "empty queue".
    wallet: wallets.get(c.characterId) ?? null,
    skills: skills.get(c.characterId) ?? null,
    queue: queues.get(c.characterId) ?? null,
    correctedTotalSp: null,
  }));
}

/**
 * Flattened to one entry per *request*, not per character, so
 * `ESI_FANOUT_CONCURRENCY` means the same thing here as in `typeNames.ts` —
 * capping characters instead would put 3x the constant in flight. Each request
 * settles on its own: a failing loader nulls one field rather than sinking the
 * character or the roster.
 */
async function loadLive(characters: readonly CharacterRecord[]): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    wallet: null,
    skills: null,
    queue: null,
    correctedTotalSp: null,
  }));

  const requests = entries.flatMap((entry) => [
    async () => {
      entry.wallet = await loadWalletBalance(entry.characterId);
    },
    async () => {
      entry.skills = await loadCharacterSkills(entry.characterId);
    },
    async () => {
      entry.queue = await loadCharacterSkillQueue(entry.characterId);
    },
  ]);

  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {
      // Field stays null.
    }
  });

  return entries;
}

/**
 * Corrects each entry's total_sp for completed-but-unapplied queue entries,
 * given the wallet/skills/queue rows already gathered — a pure merge over
 * data in hand, not a second fetch, so it applies equally to both read
 * paths below (the cache-only path never calls the corrected-skills loader
 * at all, and must not skip this).
 */
function withCorrectedTotalSp(entries: RosterEntry[], nowMs: number): RosterEntry[] {
  return entries.map((entry) => {
    if (!entry.skills?.data) return entry;
    const gain = completedSpGain(
      entry.skills.data.skills,
      completedQueueLevels(entry.queue?.data ?? [], nowMs)
    );
    return { ...entry, correctedTotalSp: entry.skills.data.total_sp + gain };
  });
}

/**
 * Cache-only by default (no live ESI call); `live: true` refreshes with
 * capped concurrency. `now` defaults to `Date.now()` — callers may inject it
 * (as the corrected-skills loader's callers do) to keep this testable.
 */
export async function loadRosterSnapshot(opts?: {
  live?: boolean;
  now?: number;
}): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];
  const entries = opts?.live ? await loadLive(characters) : await loadCacheOnly(characters);
  return withCorrectedTotalSp(entries, opts?.now ?? Date.now());
}
