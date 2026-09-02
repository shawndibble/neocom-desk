/**
 * Notification Event diff functions (CONTEXT.md round 20): one pure function
 * per event, each comparing the previous and current skill-queue snapshot and
 * deciding whether to fire. Registered into `SKILL_QUEUE_NOTIFICATION_DIFFS`
 * so the Foreground Poller (features/notifications) runs one fetch-and-diff
 * per character instead of one-off polling logic per event; every later
 * ticket that adds a skill-queue-driven event registers here too.
 *
 * Engine-native shapes only (ARCHITECTURE.md: "callers adapt SDE/ESI shapes
 * to engine types at the boundary") — callers convert the raw ESI
 * `SkillQueueEntry[]` into `SkillQueueEntrySnapshot[]`.
 *
 * `prev === undefined` means "no prior poll to compare against" (first run
 * for this character, or a fresh device) — both diffs fire nothing rather
 * than flooding the notification the first time an already-stalled or
 * already-finished queue is observed.
 */
import { colonyStatus } from './pi/colonyStatus';

export interface SkillQueueEntrySnapshot {
  skillId: number;
  finishedLevel: number;
  queuePosition: number;
  /** Epoch ms this level finishes, or null when the queue carries no date (paused/stalled). */
  finishMs: number | null;
}

export interface SkillQueueSnapshot {
  entries: readonly SkillQueueEntrySnapshot[];
  nowMs: number;
}

export type SkillQueueNotificationEventId = 'skillLevelComplete' | 'characterNotTraining';

export interface NotificationFire {
  eventId: SkillQueueNotificationEventId;
  characterId: number;
  skillId: number | null;
  level: number | null;
}

function orderedByQueuePosition(
  entries: readonly SkillQueueEntrySnapshot[]
): SkillQueueEntrySnapshot[] {
  return [...entries].sort((a, b) => a.queuePosition - b.queuePosition);
}

/** A real, not-yet-reached finish date — i.e. this entry is actually training or queued behind one that is. */
function isActive(entry: SkillQueueEntrySnapshot, nowMs: number): boolean {
  return entry.finishMs !== null && entry.finishMs > nowMs;
}

function isCompleted(entry: SkillQueueEntrySnapshot, nowMs: number): boolean {
  return entry.finishMs !== null && entry.finishMs <= nowMs;
}

/**
 * Fires per finished skill-queue entry while the queue still has more behind
 * it (CONTEXT.md round 20) — a completion that leaves nothing training is
 * `characterNotTraining`'s to report instead, not this event's.
 *
 * Edge-triggered on the entry's own finish instant rather than by matching it
 * against `prev.entries`: a queue entry's `finish_date` is fixed once queued,
 * so comparing it against `prev.nowMs` alone is enough to tell whether this
 * poll is the first to observe it as done.
 */
export function diffSkillLevelComplete(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  const ordered = orderedByQueuePosition(next.entries);
  const fires: NotificationFire[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (!isCompleted(current, next.nowMs)) continue;
    const alreadyCompletedLastPoll = current.finishMs !== null && current.finishMs <= prev.nowMs;
    if (alreadyCompletedLastPoll) continue;
    const hasMoreBehind = ordered.slice(i + 1).some((entry) => isActive(entry, next.nowMs));
    if (!hasMoreBehind) continue;
    fires.push({
      eventId: 'skillLevelComplete',
      characterId,
      skillId: current.skillId,
      level: current.finishedLevel,
    });
  }
  return fires;
}

type HeadStatus = 'training' | 'notTraining';

function headStatus(snapshot: SkillQueueSnapshot): HeadStatus {
  if (snapshot.entries.length === 0) return 'notTraining';
  const [head] = orderedByQueuePosition(snapshot.entries);
  return isActive(head, snapshot.nowMs) ? 'training' : 'notTraining';
}

/**
 * Fires when the skill queue's head entry has no active finish date, whether
 * from an empty queue or a stalled one (CONTEXT.md round 20) — deliberately
 * one unified event, since ESI exposes no way to distinguish the cause.
 * Edge-triggered on the transition into that state so a stall that persists
 * across many polls only notifies once.
 */
export function diffCharacterNotTraining(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  if (headStatus(next) !== 'notTraining') return [];
  if (headStatus(prev) === 'notTraining') return [];
  return [{ eventId: 'characterNotTraining', characterId, skillId: null, level: null }];
}

export interface IndustryJobEntrySnapshot {
  jobId: number;
  /** Epoch ms this job finishes (ESI's `end_date`, fixed once the job is started). */
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface IndustryJobSnapshot {
  entries: readonly IndustryJobEntrySnapshot[];
  nowMs: number;
}

export interface IndustryJobNotificationFire {
  eventId: 'industryJobComplete';
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

/**
 * Fires per job whose `endMs` is newly in the past — edge-triggered the same
 * way as `diffSkillLevelComplete`, comparing the job's own fixed finish
 * instant against `prev.nowMs` rather than matching job identity against
 * `prev.entries`. `loadCharacterIndustryJobs` only returns non-completed jobs
 * (CONTEXT.md/ADR: ESI keeps a finished-but-undelivered job at status `ready`
 * in that list until collected), so a job can sit in `next.entries` for many
 * polls after completing — the `endMs <= prev.nowMs` check is what stops a
 * re-fire on every one of those polls.
 */
export function diffIndustryJobComplete(
  characterId: number,
  prev: IndustryJobSnapshot | undefined,
  next: IndustryJobSnapshot
): IndustryJobNotificationFire[] {
  if (!prev) return [];
  const fires: IndustryJobNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.endMs > next.nowMs) continue;
    if (entry.endMs <= prev.nowMs) continue;
    fires.push({
      eventId: 'industryJobComplete',
      characterId,
      jobId: entry.jobId,
      blueprintTypeId: entry.blueprintTypeId,
      productTypeId: entry.productTypeId,
      activityId: entry.activityId,
    });
  }
  return fires;
}

export interface ColonyExtractorSnapshot {
  pinId: number;
  expiryTimeMs: number;
}

export interface ColonySnapshotEntry {
  planetId: number;
  extractors: readonly ColonyExtractorSnapshot[];
}

export interface PlanetarySnapshot {
  colonies: readonly ColonySnapshotEntry[];
  nowMs: number;
}

export interface PlanetaryNotificationFire {
  eventId: 'planetaryExtractionDone';
  characterId: number;
  planetId: number;
}

function colonyIdle(entry: ColonySnapshotEntry, nowMs: number): boolean {
  return colonyStatus(
    entry.extractors.map((e) => ({ pinId: e.pinId, expiryTimeMs: e.expiryTimeMs })),
    nowMs
  ).idle;
}

/**
 * Fires per colony whose extractor programs newly read idle (ADR 0005:
 * `engine/pi/colonyStatus.ts`'s `expiry_time`-only idle read, never
 * `contents[].amount`/`last_cycle_start`). Edge-triggered on the transition
 * into idle, evaluating both snapshots at their own `nowMs` the same way
 * `diffCharacterNotTraining` compares `headStatus(prev)` against
 * `headStatus(next)` — a colony missing from `prev.colonies` (first time
 * this character's poll has seen it) is treated as not-previously-idle, so a
 * colony discovered already idle still fires once.
 */
export function diffPlanetaryExtractionDone(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): PlanetaryNotificationFire[] {
  if (!prev) return [];
  const prevByPlanet = new Map(prev.colonies.map((c) => [c.planetId, c]));
  const fires: PlanetaryNotificationFire[] = [];
  for (const colony of next.colonies) {
    if (!colonyIdle(colony, next.nowMs)) continue;
    const prevColony = prevByPlanet.get(colony.planetId);
    if (prevColony && colonyIdle(prevColony, prev.nowMs)) continue;
    fires.push({ eventId: 'planetaryExtractionDone', characterId, planetId: colony.planetId });
  }
  return fires;
}

export const SKILL_QUEUE_NOTIFICATION_DIFFS: Record<
  SkillQueueNotificationEventId,
  (
    characterId: number,
    prev: SkillQueueSnapshot | undefined,
    next: SkillQueueSnapshot
  ) => NotificationFire[]
> = {
  skillLevelComplete: diffSkillLevelComplete,
  characterNotTraining: diffCharacterNotTraining,
};

/** Runs every registered diff whose event is enabled, for one character's skill-queue poll. */
export function runSkillQueueNotificationDiffs(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot,
  enabledEvents: ReadonlySet<SkillQueueNotificationEventId>
): NotificationFire[] {
  const fires: NotificationFire[] = [];
  for (const eventId of Object.keys(
    SKILL_QUEUE_NOTIFICATION_DIFFS
  ) as SkillQueueNotificationEventId[]) {
    if (!enabledEvents.has(eventId)) continue;
    fires.push(...SKILL_QUEUE_NOTIFICATION_DIFFS[eventId](characterId, prev, next));
  }
  return fires;
}
