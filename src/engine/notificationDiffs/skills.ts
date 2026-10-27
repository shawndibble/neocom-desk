/**
 * Notification Event diff functions (GLOSSARY.md round 20): one pure function
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
import { isSpExtractionReady } from '../skills/spExtraction';

export interface SkillQueueEntrySnapshot {
  skillId: number;
  finishedLevel: number;
  queuePosition: number;
  /** Epoch ms this level finishes, or null when the queue carries no date (paused/stalled). */
  finishMs: number | null;
  /**
   * The Character's `skillQueueEndingLeadHours` threshold, in ms, as it stood
   * when this poll ran (issue #1410) — baked in per entry at
   * `pollDomains/`'s `skillQueueDomain.load()` time, the same
   * `StructureFuelEntrySnapshot.thresholdMs` pattern `diffStructureFuelLow`
   * and `diffPlanetaryExtractorExpiring` use, since `DomainDiff` itself is
   * synchronous and cannot read the character's preference.
   *
   * Optional so a snapshot persisted before this field existed
   * (`pollerState.ts`) still validates, on `ColonyExtractorSnapshot.installTimeMs`'s
   * precedent: `diffSkillQueueEnding` reads an entry lacking it as "no
   * threshold recorded", the same not-previously-observed treatment that
   * gets a fresh baseline to fire once rather than never.
   */
  endingLeadMs?: number;
}

export interface SkillQueueSnapshot {
  entries: readonly SkillQueueEntrySnapshot[];
  nowMs: number;
}

export type SkillQueueNotificationEventId =
  'skillLevelComplete' | 'characterNotTraining' | 'skillQueueEnding';

export interface NotificationFire {
  eventId: SkillQueueNotificationEventId;
  characterId: number;
  skillId: number | null;
  level: number | null;
  /**
   * The completed entry's `finish_date` (issue #348: Occurrence Key input)
   * for `skillLevelComplete`, the tail entry's `finish_date` for
   * `skillQueueEnding` (issue #1410), null for `characterNotTraining`.
   */
  finishMs: number | null;
  /**
   * The Character's configured lead time, in ms, that `skillQueueEnding`
   * crossed (issue #1410) — absent for `skillLevelComplete`/
   * `characterNotTraining`, which carry no threshold of their own.
   */
  thresholdMs?: number;
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
 * it (GLOSSARY.md round 20) — a completion that leaves nothing training is
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
  // hasActiveBehind[i]: some entry after i is still active.
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

/**
 * The head is the first entry not already completed, not literally
 * `entries[0]` by queue position. `diffSkillLevelComplete` detects a
 * completion from an entry that is still present in `entries` with its
 * `finishMs` in the past, so a completed-but-present row at the front is the
 * normal shape on a completion poll — reading `entries[0]` directly would
 * misreport "not training" on every completion that has more queued behind it.
 */
function headStatus(snapshot: SkillQueueSnapshot): HeadStatus {
  const ordered = orderedByQueuePosition(snapshot.entries);
  const head = ordered.find((entry) => !isCompleted(entry, snapshot.nowMs));
  if (!head) return 'notTraining';
  return isActive(head, snapshot.nowMs) ? 'training' : 'notTraining';
}

/**
 * Fires when the skill queue's head entry has no active finish date, whether
 * from an empty queue or a stalled one (GLOSSARY.md round 20) — deliberately
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
  return [
    { eventId: 'characterNotTraining', characterId, skillId: null, level: null, finishMs: null },
  ];
}

/**
 * The queue's last queued item — the one whose finish decides when training
 * stops — or `undefined` when there is none to warn about. Not literally
 * `entries[entries.length - 1]` by queue position: a paused or stalled head
 * (`headStatus` reading `'notTraining'`) leaves nothing actually counting
 * down, which is `characterNotTraining`'s state to own, not this one's — and
 * a completed-but-unpruned row at the front (the same shape
 * `diffSkillLevelComplete` handles) must not be mistaken for the tail either.
 */
function skillQueueTail(snapshot: SkillQueueSnapshot): SkillQueueEntrySnapshot | undefined {
  if (headStatus(snapshot) !== 'training') return undefined;
  return orderedByQueuePosition(snapshot.entries)
    .filter((entry) => isActive(entry, snapshot.nowMs))
    .reduce<SkillQueueEntrySnapshot | undefined>(
      (latest, entry) => (!latest || entry.queuePosition > latest.queuePosition ? entry : latest),
      undefined
    );
}

/**
 * Fires once the skill queue's tail entry — the last queued item, the one
 * that decides when training stops — will finish within the Character's
 * configured lead time (issue #1410), so a pilot can top up the queue before
 * it goes idle: ESI has no write endpoint, so nothing but the in-game client
 * can add to it. A paused or empty queue fires nothing here — that is
 * `characterNotTraining`'s state to report, never this event's
 * (`skillQueueTail` returns `undefined` for both).
 *
 * Window-crossing, on `diffPlanetaryExtractorExpiring`'s precedent rather
 * than `diffSkillLevelComplete`'s "newly in the past" shape: `remaining <=
 * thresholdMs` stays true for as long as the tail holds that little time
 * left, so an edge-trigger is required or every later poll would re-fire.
 *
 * "Is it inside the window now" is judged against `tail.endingLeadMs` — the
 * setting in force *this* poll. "Was it already inside" is judged against
 * **`prevTail.endingLeadMs`** — the setting in force when `prev` was
 * captured — not `tail.endingLeadMs` again, so a Character who raises or
 * lowers the lead time takes effect on the very next poll in both
 * directions, exactly as `diffStructureFuelLow` documents in full.
 *
 * A tail's identity for "observed before" is its own `finishMs`, fixed once
 * queued: a tail with no counterpart in `prev` (a new pin — here, the queue
 * growing, shrinking, or the head completing and handing the tail role to
 * whatever was behind it) is treated as not-previously-inside, so one first
 * observed already inside the window still fires once, and a tail that moved
 * outside the window and later back inside fires again. `prev === undefined`
 * fires nothing, this module's rule throughout.
 */
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

/* -------------------------------------------------------------------------- */
/* SP extraction                                                              */
/* -------------------------------------------------------------------------- */

export interface SpExtractionEntrySnapshot {
  totalSp: number;
  /**
   * Baked in at fetch time (`pollDomains/`'s `spExtractionDomain`), same as
   * `walletDomain`'s `thresholdIsk` below — a preference read at the impure
   * boundary, never here.
   */
  thresholdSp: number;
}

/** Exactly one entry, always — one Character has one total SP. An array only to fit the registry's `{ nowMs, entries: T[] }` snapshot shape (`pollerState.ts`). */
export interface SpExtractionSnapshot {
  entries: readonly SpExtractionEntrySnapshot[];
  nowMs: number;
}

export interface SpExtractionFire {
  eventId: 'spExtractionReady';
  characterId: number;
}

/**
 * Fires when extractable SP crosses the pilot's threshold
 * (`engine/spExtraction.ts`'s `isSpExtractionReady`), edge-triggered the same
 * way `diffCharacterNotTraining` above is: a pilot who lets spare SP pile up
 * for months must not be renotified every poll in between — only once, when
 * it first crosses.
 *
 * Deliberately *not* `characterNotTraining`'s `if (!prev) return []` shape:
 * that guard exists because training state flaps constantly, so a first-poll
 * fire would flood. SP-ready takes months to cross, and the first poll after
 * a pilot opts into monitoring *is* their request to be told if they already
 * qualify — so an absent baseline reads as "not ready before", not "skip".
 */
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

/* -------------------------------------------------------------------------- */
/* Clone jump                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * At most one entry — none for a Character who has never jumped (ESI omits
 * `last_clone_jump_date`), so there is no cooldown to end. `readyAtMs` is
 * baked in at fetch time (`pollDomains/`'s `cloneJumpDomain`), from the
 * last jump and the effective Infomorph Synchronizing level.
 */
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

/**
 * Fires once when the jump-clone cooldown's end falls in `(prev.nowMs,
 * next.nowMs]` — `diffJobReady`'s window rule below. No baseline, no fire:
 * a first poll long after the cooldown ended is not news.
 */
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
};
