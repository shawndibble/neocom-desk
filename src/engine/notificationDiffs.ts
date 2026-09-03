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

export interface MailHeaderSnapshot {
  mailId: number;
}

export interface MailSnapshot {
  entries: readonly MailHeaderSnapshot[];
  nowMs: number;
}

export interface MailNotificationFire {
  eventId: 'newMail';
  characterId: number;
  mailId: number;
}

/**
 * Fires per mail id newly above the highest id seen in `prev` (issue #174).
 * ESI's mail list is capped at the 50 most recent (`getCharacterMailHeaders`),
 * and "load more" (`loadMoreMailHeaders`, features/character/mail.ts) can
 * write a longer merged list back to the same cache key this poller reads —
 * so a plain set-difference against `prev.entries` would treat every older
 * id newly paged in as "new mail" and flood on the next poll. `mail_id` is
 * monotonically increasing (it's what makes `last_mail_id` pagination work),
 * so gating on the high-water mark instead is immune to the window sliding
 * in either direction.
 */
export function diffNewMail(
  characterId: number,
  prev: MailSnapshot | undefined,
  next: MailSnapshot
): MailNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.mailId), 0);
  const fires: MailNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.mailId <= maxPrevId) continue;
    fires.push({ eventId: 'newMail', characterId, mailId: entry.mailId });
  }
  return fires;
}

export interface CalendarEventEntrySnapshot {
  calendarEventId: number;
  /** Epoch ms this event starts (ESI's `event_date`). */
  startMs: number;
}

export interface CalendarSnapshot {
  entries: readonly CalendarEventEntrySnapshot[];
  nowMs: number;
}

export interface NewCalendarEventFire {
  eventId: 'newCalendarEvent';
  characterId: number;
  calendarEventId: number;
}

export interface CalendarEventStartingFire {
  eventId: 'calendarEventStarting';
  characterId: number;
  calendarEventId: number;
}

/**
 * Fires per calendar event id newly above the highest id seen in `prev`
 * (issue #174) — same high-water-mark reasoning as `diffNewMail`:
 * `getCharacterCalendar` returns only up to 50 events from now, so as events
 * pass and the window slides, an older event newly entering the list must
 * not be reported as new.
 */
export function diffNewCalendarEvent(
  characterId: number,
  prev: CalendarSnapshot | undefined,
  next: CalendarSnapshot
): NewCalendarEventFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.calendarEventId), 0);
  const fires: NewCalendarEventFire[] = [];
  for (const entry of next.entries) {
    if (entry.calendarEventId <= maxPrevId) continue;
    fires.push({
      eventId: 'newCalendarEvent',
      characterId,
      calendarEventId: entry.calendarEventId,
    });
  }
  return fires;
}

/**
 * Fires per event whose `startMs` is newly in the past — edge-triggered the
 * same way as `diffIndustryJobComplete`, comparing the event's own fixed
 * start instant against `prev.nowMs` rather than matching identity against
 * `prev.entries` (issue #174). Fires up to one poll interval after the
 * event's actual start, not before or on every later poll.
 */
export function diffCalendarEventStarting(
  characterId: number,
  prev: CalendarSnapshot | undefined,
  next: CalendarSnapshot
): CalendarEventStartingFire[] {
  if (!prev) return [];
  const fires: CalendarEventStartingFire[] = [];
  for (const entry of next.entries) {
    if (entry.startMs > next.nowMs) continue;
    if (entry.startMs <= prev.nowMs) continue;
    fires.push({
      eventId: 'calendarEventStarting',
      characterId,
      calendarEventId: entry.calendarEventId,
    });
  }
  return fires;
}

/** Engine-native mirror of ESI's `Contract.status` (ARCHITECTURE.md: callers adapt ESI shapes at the boundary). */
export type ContractStatus =
  | 'outstanding'
  | 'in_progress'
  | 'finished_issuer'
  | 'finished_contractor'
  | 'finished'
  | 'cancelled'
  | 'rejected'
  | 'failed'
  | 'deleted'
  | 'reversed';

export interface ContractEntrySnapshot {
  contractId: number;
  status: ContractStatus;
}

export interface ContractSnapshot {
  entries: readonly ContractEntrySnapshot[];
  nowMs: number;
}

export interface ContractNotificationFire {
  eventId: 'contractAccepted';
  characterId: number;
  contractId: number;
}

/**
 * Fires per contract whose status is newly `in_progress` (issue #174) — ESI
 * has no `accepted` status literal; `in_progress` is what a contract becomes
 * once accepted. Edge-triggered on the transition, keyed by contract id: a
 * contract missing from `prev.entries` (first time this poll has seen it) is
 * treated as not-previously-in-progress, so a contract discovered already
 * in progress still fires once — same discovered-already-true shape as
 * `diffPlanetaryExtractionDone`. `getCharacterContracts` returns every page
 * (not windowed like mail/calendar), so no high-water-mark guard is needed
 * here.
 */
export function diffContractAccepted(
  characterId: number,
  prev: ContractSnapshot | undefined,
  next: ContractSnapshot
): ContractNotificationFire[] {
  if (!prev) return [];
  const prevStatusById = new Map(prev.entries.map((entry) => [entry.contractId, entry.status]));
  const fires: ContractNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.status !== 'in_progress') continue;
    if (prevStatusById.get(entry.contractId) === 'in_progress') continue;
    fires.push({ eventId: 'contractAccepted', characterId, contractId: entry.contractId });
  }
  return fires;
}

export interface WalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
}

export interface WalletSnapshot {
  entries: readonly WalletJournalEntrySnapshot[];
  nowMs: number;
}

export interface WalletNotificationFire {
  eventId: 'walletBalanceChanged';
  characterId: number;
  amount: number | null;
}

/**
 * Fires per wallet journal entry id newly above the highest id seen in `prev`
 * (issue #175) — same high-water-mark reasoning as `diffNewMail`: comparing
 * `balance` numbers directly would re-fire on every poll while the balance
 * merely differs from some baseline, whereas journal entry `id` is
 * monotonically increasing, so gating on it fires exactly once per new entry.
 *
 * Sorted oldest-new-entry-first rather than left in ESI's own order (the
 * journal comes back newest-first): the delivery loop stamps each fire's
 * feed entry with `Date.now()` as it's recorded, in this array's order, and
 * the feed then sorts newest-`firedAt`-first — so whichever entry is pushed
 * last here is the one that lands on top. Recording oldest first keeps that
 * outcome matching real chronology when more than one entry arrives in the
 * same poll.
 */
export function diffWalletBalanceChanged(
  characterId: number,
  prev: WalletSnapshot | undefined,
  next: WalletSnapshot
): WalletNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.id), 0);
  return next.entries
    .filter((entry) => entry.id > maxPrevId)
    .sort((a, b) => a.id - b.id)
    .map((entry) => ({ eventId: 'walletBalanceChanged', characterId, amount: entry.amount }));
}

export interface MarketOrderEntrySnapshot {
  orderId: number;
  /**
   * Derived at the adapter boundary (ARCHITECTURE.md: callers adapt ESI
   * shapes to engine types): true once an order is gone from the open-orders
   * list and present in order history with `volume_remain === 0` — ESI's
   * history `state` enum ('cancelled' | 'expired') has no distinct "filled"
   * value, so filled-ness isn't a field ESI ever hands back directly.
   */
  filled: boolean;
}

export interface MarketOrderSnapshot {
  entries: readonly MarketOrderEntrySnapshot[];
  nowMs: number;
}

export interface MarketOrderNotificationFire {
  eventId: 'marketOrderFilled';
  characterId: number;
  orderId: number;
}

/**
 * Fires per order whose `filled` is newly true (issue #175) — edge-triggered
 * on the transition, same shape as `diffContractAccepted`. Deliberately one
 * event for both directions (CONTEXT.md round 20: a completed sell and a
 * completed buy both count as `marketOrderFilled`, not two event types) —
 * `MarketOrderEntrySnapshot` carries no buy/sell field, so the diff can't
 * distinguish them even if it wanted to. An order missing from `prev.entries`
 * is treated as not-previously-filled, so one discovered already filled with
 * no prior baseline still fires once.
 */
export function diffMarketOrderFilled(
  characterId: number,
  prev: MarketOrderSnapshot | undefined,
  next: MarketOrderSnapshot
): MarketOrderNotificationFire[] {
  if (!prev) return [];
  const prevFilledById = new Map(prev.entries.map((entry) => [entry.orderId, entry.filled]));
  const fires: MarketOrderNotificationFire[] = [];
  for (const entry of next.entries) {
    if (!entry.filled) continue;
    if (prevFilledById.get(entry.orderId) === true) continue;
    fires.push({ eventId: 'marketOrderFilled', characterId, orderId: entry.orderId });
  }
  return fires;
}

export interface EveNotificationEntrySnapshot {
  notificationId: number;
  /**
   * ESI's own open-ended type enum (`AllWarDeclaredMsg`, `BillOutOfMoneyMsg`,
   * ...). Deliberately `string`, not a closed union — CCP adds types without
   * notice (issue #274, esi/esi-issues#1380), and a consumer that assumed a
   * closed enum breaks on an unrecognised one. This diff, and every consumer
   * of its fire, must render an unknown value generically rather than drop
   * or throw on it.
   */
  type: string;
  senderId: number;
  senderType: string;
  text: string;
  timestamp: string;
}

export interface EveNotificationSnapshot {
  entries: readonly EveNotificationEntrySnapshot[];
  nowMs: number;
}

export interface EveNotificationFire {
  eventId: 'eveNotification';
  characterId: number;
  notificationId: number;
  type: string;
  senderId: number;
  senderType: string;
  text: string;
  timestamp: string;
}

/**
 * Fires per EVE-native notification id newly above the highest id seen in
 * `prev` (issue #274) — same high-water-mark reasoning as `diffNewMail`:
 * `getCharacterNotifications` returns a bounded recent window rather than
 * full history, so a plain set-difference would treat an older notification
 * newly paged in as new. `notification_id` is assigned sequentially by the
 * game server, so it is monotonically increasing the same way `mail_id` is.
 */
export function diffEveNotification(
  characterId: number,
  prev: EveNotificationSnapshot | undefined,
  next: EveNotificationSnapshot
): EveNotificationFire[] {
  if (!prev) return [];
  const maxPrevId = prev.entries.reduce((max, entry) => Math.max(max, entry.notificationId), 0);
  const fires: EveNotificationFire[] = [];
  for (const entry of next.entries) {
    if (entry.notificationId <= maxPrevId) continue;
    fires.push({
      eventId: 'eveNotification',
      characterId,
      notificationId: entry.notificationId,
      type: entry.type,
      senderId: entry.senderId,
      senderType: entry.senderType,
      text: entry.text,
      timestamp: entry.timestamp,
    });
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
