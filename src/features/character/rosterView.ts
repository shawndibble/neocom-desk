/**
 * The Characters route's one derived-per-character row, built in a single
 * pass over a roster snapshot — `stats` (`rosterSortStats`), the skill
 * queue's display state, job-slot skill levels, and raw `total_sp`, all of
 * which the cache-only load effect and "Refresh all" must otherwise keep in
 * lockstep across separate `Map`s. Collapsing them into one `RosterCore` per
 * character means a future added field is one property on one type, not a
 * fourth/fifth `useState` plus a fourth/fifth line in two hand-written
 * merge functions. `attentionById` (manufacturing/PI attention) stays a
 * separate `Map` in `Characters.tsx`: it comes from a different ESI read
 * (`loadRosterAttention`), on its own effect and its own cadence, and is
 * never produced by `loadRosterSnapshot` — folding it in here would make one
 * "roster core" object true only after two independent fetches settle.
 */
import { jobSlotSkillsFromCharacterSkills } from '@/features/character/jobSlotSkills';
import type { JobSlotSkills } from '@/engine/industry/jobSlots';
import {
  classifySkillQueue,
  deriveQueueState,
  type QueueState,
} from '@/features/skills/queueStatus';
import { rosterSortStats, type CharacterSortStats } from './groups';
import type { RosterEntry } from './roster';

export interface QueueInfo {
  state: QueueState;
  /** When this character's cached queue was last fetched; null when never fetched. */
  fetchedAt: Date | null;
  /** Epoch ms the currently-training entry finishes; null unless `state` is `training`/`endingSoon`. */
  trainingFinishMs: number | null;
}

/** One character's roster-derived row — everything `applyRoster`/`mergeRosterEntry` used to spread across four `Map`s. */
export interface RosterCore {
  stats: CharacterSortStats;
  queue: QueueInfo;
  /** From the same roster snapshot `stats` comes from — undefined until skills have loaded once. */
  jobSlotSkills: JobSlotSkills | undefined;
  /** Raw `total_sp` (not `correctedTotalSp`) — see the doc comment below. */
  totalSp: number | undefined;
}

function queueInfoFor(entry: RosterEntry, nowMs: number): QueueInfo {
  const entries = entry.queue?.data;
  // `classifySkillQueue`'s own "currently training" row, not a second
  // derivation of it — `deriveQueueState` already calls this for the
  // categorical state, but doesn't expose which entry it landed on.
  const training = entries
    ? classifySkillQueue(entries, nowMs).find((row) => row.status === 'training')
    : undefined;
  return {
    state: deriveQueueState(entries, nowMs),
    fetchedAt: entry.queue?.fetchedAt ?? null,
    trainingFinishMs:
      training?.secondsRemaining != null ? nowMs + training.secondsRemaining * 1000 : null,
  };
}

/**
 * Raw `total_sp`, not `correctedTotalSp` — deliberately, and only for this
 * one field. `correctedTotalSp` exists so a displayed SP total doesn't
 * contradict a per-skill figure shown beside it (roster.ts's own comment);
 * SP-extraction readiness needs no such agreement, and it must match what
 * `pollDomains.ts`'s `spExtractionDomain` alerts on (also raw `total_sp`), or
 * the table and the alert could disagree about whether a character is ready.
 */
function totalSpFor(entry: RosterEntry): number | undefined {
  return entry.skills?.data?.total_sp;
}

function jobSlotSkillsFor(entry: RosterEntry, nowMs: number): JobSlotSkills | undefined {
  if (!entry.skills?.data) return undefined;
  return jobSlotSkillsFromCharacterSkills(entry.skills.data.skills, entry.queue?.data ?? [], nowMs);
}

/**
 * Roster snapshot -> one `RosterCore` per character, in a single pass —
 * shared by the cache-only load effect and "Refresh all" so the two never
 * compute a character's row differently.
 */
export function rosterCoreMap(
  roster: readonly RosterEntry[],
  nowMs: number
): Map<number, RosterCore> {
  const statsById = rosterSortStats(roster);
  const map = new Map<number, RosterCore>();
  for (const entry of roster) {
    const stats = statsById.get(entry.characterId);
    if (!stats) continue; // rosterSortStats sets one entry per roster row; this never actually misses
    map.set(entry.characterId, {
      stats,
      queue: queueInfoFor(entry, nowMs),
      jobSlotSkills: jobSlotSkillsFor(entry, nowMs),
      totalSp: totalSpFor(entry),
    });
  }
  return map;
}

/**
 * `rosterCoreMap` for one character that just finished refreshing: merges
 * into the previous map rather than replacing it, so the rest of the
 * roster keeps its rows. `jobSlotSkills`/`totalSp` fall back to the
 * character's previous values when the fresh entry has no skills row
 * (`loadLive`'s "a failing loader nulls one field rather than sinking the
 * character" — roster.ts) — a `/skills` refresh that fails must not blank a
 * value the roster already had, the same as the four-`Map` version this
 * replaced (its `jobSlotSkillsMap`/`totalSpMap` simply skipped such an
 * entry, so the old value in each `Map` survived the merge untouched).
 * `stats`/`queue` always take the fresh value, as before: both are built
 * for every roster entry regardless of what failed, `queue`'s own `state`
 * reading `unknown` rather than holding a stale prior reading.
 */
export function mergeRosterCore(
  previous: Map<number, RosterCore>,
  entry: RosterEntry,
  nowMs: number
): Map<number, RosterCore> {
  const fresh = rosterCoreMap([entry], nowMs).get(entry.characterId);
  if (!fresh) return previous; // rosterCoreMap sets one entry per roster row passed in; this never actually misses
  const prior = previous.get(entry.characterId);
  const merged: RosterCore = {
    ...fresh,
    jobSlotSkills: fresh.jobSlotSkills ?? prior?.jobSlotSkills,
    totalSp: fresh.totalSp ?? prior?.totalSp,
  };
  return new Map(previous).set(entry.characterId, merged);
}
