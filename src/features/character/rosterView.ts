import { jobSlotSkillsFromCharacterSkills } from '@/features/character/jobSlotSkills';
import type { JobSlotSkills } from '@/engine/industry/jobSlots';
import { classifySkillQueue, deriveQueueState, type QueueState } from '@/engine/skills/queueStatus';
import { rosterSortStats, type CharacterSortStats } from './groups';
import type { RosterEntry } from './roster';

export interface QueueInfo {
  state: QueueState;
  fetchedAt: Date | null;
  trainingFinishMs: number | null;
}

export interface RosterCore {
  stats: CharacterSortStats;
  queue: QueueInfo;
  jobSlotSkills: JobSlotSkills | undefined;
  totalSp: number | undefined;
}

function queueInfoFor(entry: RosterEntry, nowMs: number): QueueInfo {
  const entries = entry.queue?.data;
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

function totalSpFor(entry: RosterEntry): number | undefined {
  return entry.skills?.data?.total_sp;
}

function jobSlotSkillsFor(entry: RosterEntry, nowMs: number): JobSlotSkills | undefined {
  if (!entry.skills?.data) return undefined;
  return jobSlotSkillsFromCharacterSkills(entry.skills.data.skills, entry.queue?.data ?? [], nowMs);
}

export function rosterCoreMap(
  roster: readonly RosterEntry[],
  nowMs: number
): Map<number, RosterCore> {
  const statsById = rosterSortStats(roster);
  const map = new Map<number, RosterCore>();
  for (const entry of roster) {
    const stats = statsById.get(entry.characterId);
    if (!stats) continue;
    map.set(entry.characterId, {
      stats,
      queue: queueInfoFor(entry, nowMs),
      jobSlotSkills: jobSlotSkillsFor(entry, nowMs),
      totalSp: totalSpFor(entry),
    });
  }
  return map;
}

export function mergeRosterCore(
  previous: Map<number, RosterCore>,
  entry: RosterEntry,
  nowMs: number
): Map<number, RosterCore> {
  const fresh = rosterCoreMap([entry], nowMs).get(entry.characterId);
  if (!fresh) return previous;
  const prior = previous.get(entry.characterId);
  const merged: RosterCore = {
    ...fresh,
    queue: fresh.queue.fetchedAt === null && prior ? prior.queue : fresh.queue,
    jobSlotSkills: fresh.jobSlotSkills ?? prior?.jobSlotSkills,
    totalSp: fresh.totalSp ?? prior?.totalSp,
  };
  return new Map(previous).set(entry.characterId, merged);
}
