import { db, type CharacterRecord } from '@/db';
import { readCachedRows, type CachedResult } from '@/esi/cache';
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { completedQueueLevels, completedSpGain } from '@/engine/skills/queueStatus';
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
  correctedTotalSp: number | null;
}

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
    wallet: wallets.get(c.characterId) ?? null,
    skills: skills.get(c.characterId) ?? null,
    queue: queues.get(c.characterId) ?? null,
    correctedTotalSp: null,
  }));
}

async function loadLive(
  characters: readonly CharacterRecord[],
  nowMs: number,
  onEntry?: (entry: RosterEntry) => void
): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = characters.map((c) => ({
    characterId: c.characterId,
    name: c.name,
    wallet: null,
    skills: null,
    queue: null,
    correctedTotalSp: null,
  }));

  const pending = new Map(entries.map((entry) => [entry.characterId, 3]));
  const settle = (entry: RosterEntry) => {
    const left = (pending.get(entry.characterId) ?? 1) - 1;
    pending.set(entry.characterId, left);
    if (left === 0) onEntry?.(withCorrectedTotalSp(entry, nowMs));
  };

  const requests = entries.flatMap((entry) =>
    [
      async () => {
        entry.wallet = await loadWalletBalance(entry.characterId);
      },
      async () => {
        entry.skills = await loadCharacterSkills(entry.characterId);
      },
      async () => {
        entry.queue = await loadCharacterSkillQueue(entry.characterId);
      },
    ].map((run) => ({ entry, run }))
  );

  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async ({ entry, run }) => {
    try {
      await run();
    } catch {}
    settle(entry);
  });

  return entries;
}

function withCorrectedTotalSp(entry: RosterEntry, nowMs: number): RosterEntry {
  if (!entry.skills?.data) return entry;
  const gain = completedSpGain(
    entry.skills.data.skills,
    completedQueueLevels(entry.queue?.data ?? [], nowMs)
  );
  return { ...entry, correctedTotalSp: entry.skills.data.total_sp + gain };
}

export async function loadRosterSnapshot(opts?: {
  live?: boolean;
  now?: number;
  onEntry?: (entry: RosterEntry) => void;
}): Promise<RosterEntry[]> {
  const characters = await db.characters.toArray();
  if (characters.length === 0) return [];
  const nowMs = opts?.now ?? Date.now();
  const entries = opts?.live
    ? await loadLive(characters, nowMs, opts.onEntry)
    : await loadCacheOnly(characters);
  return entries.map((entry) => withCorrectedTotalSp(entry, nowMs));
}
