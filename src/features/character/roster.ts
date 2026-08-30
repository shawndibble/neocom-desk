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

/** Cache-only: no ESI calls, batch-reads whatever is already in Dexie. */
async function loadCacheOnly(): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];

  const ids = characters.map((c) => c.characterId);
  const [wallets, skills, queues] = await Promise.all([
    readCachedRows<number>(ids, CACHE_KEYS.wallet),
    readCachedRows<CharacterSkills>(ids, CACHE_KEYS.skills),
    readCachedRows<SkillQueueEntry[]>(ids, CACHE_KEYS.queue),
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
 * `live: true`: refreshes every character through the existing per-character
 * ESI-or-cache loaders.
 *
 * The work list is flattened to one entry per *request*, not per character,
 * so `ESI_FANOUT_CONCURRENCY` means the same thing here as it does in
 * `typeNames.ts`. Capping characters instead would put three times the
 * constant in flight, quietly relaxing the budget CLAUDE.md requires
 * respecting.
 *
 * Each request settles on its own, so one failing loader leaves that one
 * field null rather than sinking the character or the rest of the roster.
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
      // Leaves this one field null; the other requests are unaffected.
    }
  });

  return entries;
}

/** Cache-only by default (no live ESI call); `live: true` refreshes with capped concurrency. */
export function loadRosterSnapshot(opts?: { live?: boolean }): Promise<RosterEntry[]> {
  return opts?.live ? loadLive() : loadCacheOnly();
}
