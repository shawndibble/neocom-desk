import { isSpExtractionReady } from '../skills/spExtraction';

export interface SkillQueueEntrySnapshot {
  skillId: number;
  finishedLevel: number;
  queuePosition: number;
  finishMs: number | null;
  endingLeadMs?: number;
}

export interface SkillQueueSnapshot {
  entries: readonly SkillQueueEntrySnapshot[];
  nowMs: number;
}

export type SkillQueueNotificationEventId =
  'skillLevelComplete' | 'characterNotTraining' | 'skillQueueEnding' | 'omegaLapsed';

export interface NotificationFire {
  eventId: SkillQueueNotificationEventId;
  characterId: number;
  skillId: number | null;
  level: number | null;
  finishMs: number | null;
  thresholdMs?: number;
}

function orderedByQueuePosition(
  entries: readonly SkillQueueEntrySnapshot[]
): SkillQueueEntrySnapshot[] {
  return [...entries].sort((a, b) => a.queuePosition - b.queuePosition);
}

function isActive(entry: SkillQueueEntrySnapshot, nowMs: number): boolean {
  return entry.finishMs !== null && entry.finishMs > nowMs;
}

function isCompleted(entry: SkillQueueEntrySnapshot, nowMs: number): boolean {
  return entry.finishMs !== null && entry.finishMs <= nowMs;
}

export function diffSkillLevelComplete(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  const ordered = orderedByQueuePosition(next.entries);
  const fires: NotificationFire[] = [];
  const hasActiveBehind = new Array<boolean>(ordered.length).fill(false);
  for (let i = ordered.length - 2; i >= 0; i--) {
    hasActiveBehind[i] = hasActiveBehind[i + 1] || isActive(ordered[i + 1], next.nowMs);
  }
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i];
    if (!isCompleted(current, next.nowMs)) continue;
    const alreadyCompletedLastPoll = current.finishMs !== null && current.finishMs <= prev.nowMs;
    if (alreadyCompletedLastPoll) continue;
    if (!hasActiveBehind[i]) continue;
    fires.push({
      eventId: 'skillLevelComplete',
      characterId,
      skillId: current.skillId,
      level: current.finishedLevel,
      finishMs: current.finishMs,
    });
  }
  return fires;
}

type HeadStatus = 'training' | 'notTraining';

function headStatus(snapshot: SkillQueueSnapshot): HeadStatus {
  const ordered = orderedByQueuePosition(snapshot.entries);
  const head = ordered.find((entry) => !isCompleted(entry, snapshot.nowMs));
  if (!head) return 'notTraining';
  return isActive(head, snapshot.nowMs) ? 'training' : 'notTraining';
}

export function diffCharacterNotTraining(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  if (headStatus(next) !== 'notTraining') return [];
  if (headStatus(prev) === 'notTraining') return [];
  return [
    { eventId: 'characterNotTraining', characterId, skillId: null, level: null, finishMs: null },
  ];
}

function skillQueueTail(snapshot: SkillQueueSnapshot): SkillQueueEntrySnapshot | undefined {
  if (headStatus(snapshot) !== 'training') return undefined;
  return orderedByQueuePosition(snapshot.entries)
    .filter((entry) => isActive(entry, snapshot.nowMs))
    .reduce<SkillQueueEntrySnapshot | undefined>(
      (latest, entry) => (!latest || entry.queuePosition > latest.queuePosition ? entry : latest),
      undefined
    );
}

export function diffSkillQueueEnding(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  const tail = skillQueueTail(next);
  if (!tail || tail.finishMs === null || tail.endingLeadMs === undefined) return [];
  const finishMs = tail.finishMs;
  const remainingNow = finishMs - next.nowMs;
  if (remainingNow > tail.endingLeadMs) return [];

  const prevTail = skillQueueTail(prev);
  const observedBefore = prevTail !== undefined && prevTail.finishMs === finishMs;
  if (observedBefore && prevTail.endingLeadMs !== undefined) {
    const remainingPrev = finishMs - prev.nowMs;
    if (remainingPrev <= prevTail.endingLeadMs) return [];
  }

  return [
    {
      eventId: 'skillQueueEnding',
      characterId,
      skillId: tail.skillId,
      level: tail.finishedLevel,
      finishMs,
      thresholdMs: tail.endingLeadMs,
    },
  ];
}

export interface SpExtractionEntrySnapshot {
  totalSp: number;
  thresholdSp: number;
}

export interface SpExtractionSnapshot {
  entries: readonly SpExtractionEntrySnapshot[];
  nowMs: number;
}

export interface SpExtractionFire {
  eventId: 'spExtractionReady';
  characterId: number;
}

export function diffSpExtractionReady(
  characterId: number,
  prev: SpExtractionSnapshot | undefined,
  next: SpExtractionSnapshot
): SpExtractionFire[] {
  const current = next.entries[0];
  if (!current || !isSpExtractionReady(current.totalSp, current.thresholdSp)) return [];
  const before = prev?.entries[0];
  if (before && isSpExtractionReady(before.totalSp, before.thresholdSp)) return [];
  return [{ eventId: 'spExtractionReady', characterId }];
}

export interface CloneJumpEntrySnapshot {
  lastJumpMs: number;
  readyAtMs: number;
}

export interface CloneJumpSnapshot {
  entries: readonly CloneJumpEntrySnapshot[];
  nowMs: number;
}

export interface CloneJumpReadyFire {
  eventId: 'cloneJumpReady';
  characterId: number;
  lastJumpMs: number;
  readyAtMs: number;
}

export function diffCloneJumpReady(
  characterId: number,
  prev: CloneJumpSnapshot | undefined,
  next: CloneJumpSnapshot
): CloneJumpReadyFire[] {
  if (!prev) return [];
  const fires: CloneJumpReadyFire[] = [];
  for (const { lastJumpMs, readyAtMs } of next.entries) {
    if (readyAtMs > next.nowMs || readyAtMs <= prev.nowMs) continue;
    fires.push({ eventId: 'cloneJumpReady', characterId, lastJumpMs, readyAtMs });
  }
  return fires;
}

export const OMEGA_LAPSED_RATIO = 1.97;
const OMEGA_LAPSED_GAP_FACTOR = 4;
const OMEGA_LAPSED_DATA_AGE_MS = 10 * 60 * 1000;

function activeEntry(
  snapshot: SkillQueueSnapshot
): (SkillQueueEntrySnapshot & { finishMs: number }) | undefined {
  return orderedByQueuePosition(snapshot.entries).find(
    (entry): entry is SkillQueueEntrySnapshot & { finishMs: number } =>
      isActive(entry, snapshot.nowMs)
  );
}

export function diffOmegaLapsed(
  characterId: number,
  prev: SkillQueueSnapshot | undefined,
  next: SkillQueueSnapshot
): NotificationFire[] {
  if (!prev) return [];
  const gap = next.nowMs - prev.nowMs;
  const before = activeEntry(prev);
  const after = activeEntry(next);
  if (gap <= 0 || !before || !after) return [];
  if (before.skillId !== after.skillId || before.finishedLevel !== after.finishedLevel) return [];
  const expectedRemaining = before.finishMs - next.nowMs;
  if (expectedRemaining < OMEGA_LAPSED_GAP_FACTOR * (gap + OMEGA_LAPSED_DATA_AGE_MS)) return [];
  if ((after.finishMs - next.nowMs) / expectedRemaining < OMEGA_LAPSED_RATIO) return [];
  return [
    {
      eventId: 'omegaLapsed',
      characterId,
      skillId: after.skillId,
      level: after.finishedLevel,
      finishMs: after.finishMs,
    },
  ];
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
  skillQueueEnding: diffSkillQueueEnding,
  omegaLapsed: diffOmegaLapsed,
};
