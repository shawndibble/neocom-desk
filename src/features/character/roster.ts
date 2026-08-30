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

/** Cache-only by default (no live ESI call); `live: true` refreshes with capped concurrency. */
export async function loadRosterSnapshot(opts?: { live?: boolean }): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];
  return opts?.live ? loadLive(characters) : loadCacheOnly(characters);
}
