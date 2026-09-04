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
import { diffRoster } from './corp/members';

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
  /** The completed entry's `finish_date` (issue #348: Occurrence Key input), null for `characterNotTraining`. */
  finishMs: number | null;
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
  return [
    { eventId: 'characterNotTraining', characterId, skillId: null, level: null, finishMs: null },
  ];
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
 * The shape `diffIndustryJobComplete` and `diffCorpIndustryJobReady` (#299)
 * both diff — same edge-trigger, same fields, same personal-vs-corp job
 * shape, differing only in which endpoint filled it and which `eventId`
 * names the fire. Kept as a private helper rather than two independent
 * copies of the loop.
 */
interface JobReadyEntry {
  jobId: number;
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

interface JobReadyFire<TEventId extends string> {
  eventId: TEventId;
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
 * `prev.entries`. Both loaders this feeds (`loadCharacterIndustryJobs`,
 * `loadCorporationIndustryJobs`) only return non-completed jobs (CONTEXT.md/
 * ADR: ESI keeps a finished-but-undelivered job at status `ready` in that
 * list until collected), so a job can sit in `next.entries` for many polls
 * after completing — the `endMs <= prev.nowMs` check is what stops a re-fire
 * on every one of those polls.
 */
function diffJobReady<TEventId extends string, TEntry extends JobReadyEntry>(
  eventId: TEventId,
  characterId: number,
  prev: { entries: readonly TEntry[]; nowMs: number } | undefined,
  next: { entries: readonly TEntry[]; nowMs: number }
): JobReadyFire<TEventId>[] {
  if (!prev) return [];
  const fires: JobReadyFire<TEventId>[] = [];
  for (const entry of next.entries) {
    if (entry.endMs > next.nowMs) continue;
    if (entry.endMs <= prev.nowMs) continue;
    fires.push({
      eventId,
      characterId,
      jobId: entry.jobId,
      blueprintTypeId: entry.blueprintTypeId,
      productTypeId: entry.productTypeId,
      activityId: entry.activityId,
    });
  }
  return fires;
}

export function diffIndustryJobComplete(
  characterId: number,
  prev: IndustryJobSnapshot | undefined,
  next: IndustryJobSnapshot
): IndustryJobNotificationFire[] {
  return diffJobReady('industryJobComplete', characterId, prev, next);
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
  /**
   * Soonest `expiry_time` across the colony's extractors (issue #348:
   * Occurrence Key input) — fixed at program install, so it identifies which
   * extractor's expiry actually crossed the colony into idle regardless of
   * which poll observed it.
   */
  expiryTimeMs: number;
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
    fires.push({
      eventId: 'planetaryExtractionDone',
      characterId,
      planetId: colony.planetId,
      expiryTimeMs: Math.min(...colony.extractors.map((e) => e.expiryTimeMs)),
    });
  }
  return fires;
}

/**
 * Lead times before an extractor program's `expiry_time` at which a warning
 * fires (issue #310), most distant first: a poll that skips over both edges
 * reports both, and the notification tag is per Character *and* per event, so
 * emitting the 12-hour copy last is what leaves the more urgent one on screen.
 *
 * Deliberately its own constant rather than an import of
 * `pi/colonyStatus.ts`'s `EXPIRING_SOON_WINDOW_MS`: that one is the Planetary
 * Industry table's colour threshold, and the two are free to diverge — a
 * notification cadence is not a status colour.
 */
export const EXTRACTOR_EXPIRY_WARNING_MS: readonly number[] = [24 * 3_600_000, 12 * 3_600_000];

export interface ExtractorExpiringFire {
  eventId: 'planetaryExtractorExpiring';
  characterId: number;
  planetId: number;
  pinId: number;
  /** Which lead-time window was crossed, in ms — one of `EXTRACTOR_EXPIRY_WARNING_MS`. */
  thresholdMs: number;
  /** The program's `expiry_time` (issue #348: Occurrence Key input) — fixed for the program's life. */
  expiryTimeMs: number;
}

/**
 * Fires per extractor program that has newly crossed into a lead-time window
 * before its `expiry_time` (issue #310), once per window.
 *
 * The predicate is deliberately **not** `diffCalendarEventStarting`'s "newly
 * in the past" shape. `expiry - now <= 24h` stays true forever once the
 * program has expired, so that shape would tell a user who closed the app at
 * T−30h and reopened at T+5h that a program dead for five hours is "expiring
 * soon". Both halves are required:
 *
 * - the **window-crossing edge** — the program was outside the window at
 *   `prev.nowMs` and is inside it at `next.nowMs`; and
 * - **`expiryTimeMs > next.nowMs`** — it has not already expired. An expired
 *   program is `diffPlanetaryExtractionDone`'s to report, never this event's,
 *   and the boundary lines up exactly: `colonyStatus` reads a colony as idle
 *   from `nowMs >= expiryTimeMs`, which is where this diff stops firing.
 *
 * A program's identity is `(pinId, expiryTimeMs)`, because `expiry_time` is
 * fixed for a program's life: a pin whose expiry changed is carrying a *new*
 * program, and the dead one's position inside a window must not swallow the
 * new one's first crossing. A program with no counterpart in `prev` — a new
 * pin, or a colony this character's poll has not seen before — is treated as
 * not-previously-inside, so one first observed already inside a window still
 * fires once for it, matching `diffPlanetaryExtractionDone`'s treatment of a
 * colony first seen idle. `prev === undefined` fires nothing, like every
 * other diff in this module.
 */
export function diffPlanetaryExtractorExpiring(
  characterId: number,
  prev: PlanetarySnapshot | undefined,
  next: PlanetarySnapshot
): ExtractorExpiringFire[] {
  if (!prev) return [];
  const prevByPlanet = new Map(prev.colonies.map((c) => [c.planetId, c]));
  const fires: ExtractorExpiringFire[] = [];
  for (const colony of next.colonies) {
    const prevColony = prevByPlanet.get(colony.planetId);
    const prevByPin = new Map((prevColony?.extractors ?? []).map((e) => [e.pinId, e]));
    for (const extractor of colony.extractors) {
      if (extractor.expiryTimeMs <= next.nowMs) continue;
      const observedBefore =
        prevByPin.get(extractor.pinId)?.expiryTimeMs === extractor.expiryTimeMs;
      for (const thresholdMs of EXTRACTOR_EXPIRY_WARNING_MS) {
        if (extractor.expiryTimeMs - next.nowMs > thresholdMs) continue;
        if (observedBefore && extractor.expiryTimeMs - prev.nowMs <= thresholdMs) continue;
        fires.push({
          eventId: 'planetaryExtractorExpiring',
          characterId,
          planetId: colony.planetId,
          pinId: extractor.pinId,
          thresholdMs,
          expiryTimeMs: extractor.expiryTimeMs,
        });
      }
    }
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

/* -------------------------------------------------------------------------- */
/* Corp: structure fuel low                                                   */
/* -------------------------------------------------------------------------- */

export interface StructureFuelEntrySnapshot {
  structureId: number;
  name: string;
  /** Absent from ESI once a structure has run dry — parsed to `null`, never a stale date. */
  fuelExpiresMs: number | null;
  /**
   * The user's chosen lead time, in ms, as it stood when this poll ran (issue
   * #299) — baked in per entry at `pollDomains.ts`'s `load()` time, since
   * `DomainDiff` itself is synchronous and cannot read the character's
   * preference. Carried on every entry of one poll rather than as a snapshot
   * scalar, matching every other domain's `{ nowMs, <entries> }` shape.
   */
  thresholdMs: number;
}

export interface StructureFuelSnapshot {
  entries: readonly StructureFuelEntrySnapshot[];
  nowMs: number;
}

export interface StructureFuelLowFire {
  eventId: 'structureFuelLow';
  characterId: number;
  structureId: number;
  structureName: string;
  thresholdMs: number;
  /**
   * The structure's `fuel_expires` at fire time (issue #348: Occurrence Key
   * input) — this diff's own re-fire identity is `(structureId,
   * fuelExpiresMs)`, not `structureId` alone: a refuel starts a new
   * countdown, distinct from the one that already fired.
   */
  fuelExpiresMs: number;
}

/**
 * Fires per structure whose remaining fuel has newly crossed under the
 * Character's chosen lead time (issue #299) — additive to CCP's own
 * `StructureFuelAlert`, which fires at its own fixed, late point (#274/#300),
 * not a duplicate of it.
 *
 * Window-crossing, on `diffPlanetaryExtractorExpiring`'s precedent rather than
 * `diffIndustryJobComplete`'s "newly in the past" shape: `remaining <=
 * thresholdMs` stays true for as long as the structure holds that little fuel,
 * so an edge-trigger is required or every later poll would re-fire. Both
 * halves of that precedent apply here too — `fuelExpiresMs > next.nowMs` (not
 * already run dry; that transition is CCP's own alert's territory, not this
 * one's) and the crossing itself.
 *
 * "Is it inside the window now" is judged against `entry.thresholdMs` — the
 * setting in force *this* poll. "Was it already inside, and so already
 * reported" is judged against **`prevEntry.thresholdMs`**, the setting that
 * was in force *the poll `prev` was captured under* — not `entry.thresholdMs`
 * again. Reusing the current threshold for both would make a Character who
 * *raises* the lead time (1 day -> 7) retroactively read every earlier poll as
 * "already inside" the new, wider window, so a structure genuinely newly
 * eligible would never fire (AC4: a threshold change must take effect on the
 * very next poll). Comparing each side to the threshold that was actually
 * live when it was measured is what makes both directions — raising and
 * lowering — correct without special-casing either.
 *
 * A structure's identity for "observed before" is `(structureId,
 * fuelExpiresMs)`: a refuel pushes `fuel_expires` to a new, later instant,
 * which is a new countdown and fires again when it later crosses the same
 * lead time — the same reasoning `diffPlanetaryExtractorExpiring` applies to
 * `(pinId, expiryTimeMs)`. A structure with no counterpart in `prev` (new to
 * this poll) is treated as not-previously-inside, so one discovered already
 * under threshold still fires once.
 */
export function diffStructureFuelLow(
  characterId: number,
  prev: StructureFuelSnapshot | undefined,
  next: StructureFuelSnapshot
): StructureFuelLowFire[] {
  if (!prev) return [];
  const prevByStructure = new Map(prev.entries.map((entry) => [entry.structureId, entry]));
  const fires: StructureFuelLowFire[] = [];
  for (const entry of next.entries) {
    if (entry.fuelExpiresMs === null) continue;
    const remainingNow = entry.fuelExpiresMs - next.nowMs;
    if (remainingNow > entry.thresholdMs) continue;
    if (remainingNow <= 0) continue;
    const prevEntry = prevByStructure.get(entry.structureId);
    const observedBefore =
      prevEntry !== undefined && prevEntry.fuelExpiresMs === entry.fuelExpiresMs;
    if (observedBefore && prevEntry.fuelExpiresMs !== null) {
      const remainingPrev = prevEntry.fuelExpiresMs - prev.nowMs;
      if (remainingPrev <= prevEntry.thresholdMs) continue;
    }
    fires.push({
      eventId: 'structureFuelLow',
      characterId,
      structureId: entry.structureId,
      structureName: entry.name,
      thresholdMs: entry.thresholdMs,
      fuelExpiresMs: entry.fuelExpiresMs,
    });
  }
  return fires;
}

/* -------------------------------------------------------------------------- */
/* Corp: industry jobs                                                        */
/* -------------------------------------------------------------------------- */

export interface CorpIndustryJobEntrySnapshot {
  jobId: number;
  endMs: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

export interface CorpIndustryJobSnapshot {
  entries: readonly CorpIndustryJobEntrySnapshot[];
  nowMs: number;
}

export interface CorpIndustryJobNotificationFire {
  eventId: 'corpIndustryJobReady';
  characterId: number;
  jobId: number;
  blueprintTypeId: number;
  productTypeId: number | null;
  activityId: number;
}

/**
 * The corp analogue of `diffIndustryJobComplete` (issue #299) — identical
 * edge-triggered shape, against the corporation's industry jobs rather than
 * the Character's own. `loadCorporationIndustryJobs` excludes delivered jobs
 * the same way the personal loader does, so a job can sit in `next.entries`
 * for many polls after finishing; `endMs <= prev.nowMs` is what stops a
 * re-fire on every one of those.
 */
export function diffCorpIndustryJobReady(
  characterId: number,
  prev: CorpIndustryJobSnapshot | undefined,
  next: CorpIndustryJobSnapshot
): CorpIndustryJobNotificationFire[] {
  return diffJobReady('corpIndustryJobReady', characterId, prev, next);
}

/* -------------------------------------------------------------------------- */
/* Corp: member roster                                                        */
/* -------------------------------------------------------------------------- */

export interface CorpRosterMemberSnapshot {
  characterId: number;
}

export interface CorpRosterSnapshot {
  entries: readonly CorpRosterMemberSnapshot[];
  nowMs: number;
}

export interface CorpMemberJoinedFire {
  eventId: 'corpMemberJoined';
  characterId: number;
  memberCharacterId: number;
}

export interface CorpMemberLeftFire {
  eventId: 'corpMemberLeft';
  characterId: number;
  memberCharacterId: number;
}

function rosterIds(snapshot: CorpRosterSnapshot | undefined): readonly number[] | undefined {
  return snapshot?.entries.map((entry) => entry.characterId);
}

/**
 * Thin adapters onto `engine/corp/members.ts`'s `diffRoster` (#297/#333) —
 * this ticket (#299) consumes that diff, it does not recompute it.
 * `diffRoster` already answers "no change" when `prev` is `undefined`, which
 * is this module's usual first-poll-fires-nothing rule expressed one layer
 * down.
 */
export function diffCorpMemberJoined(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberJoinedFire[] {
  const { joined } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return joined.map((memberCharacterId) => ({
    eventId: 'corpMemberJoined' as const,
    characterId,
    memberCharacterId,
  }));
}

export function diffCorpMemberLeft(
  characterId: number,
  prev: CorpRosterSnapshot | undefined,
  next: CorpRosterSnapshot
): CorpMemberLeftFire[] {
  const { left } = diffRoster(rosterIds(prev), rosterIds(next) ?? []);
  return left.map((memberCharacterId) => ({
    eventId: 'corpMemberLeft' as const,
    characterId,
    memberCharacterId,
  }));
}

/* -------------------------------------------------------------------------- */
/* Corp: wallet threshold                                                     */
/* -------------------------------------------------------------------------- */

export interface CorpWalletJournalEntrySnapshot {
  id: number;
  amount: number | null;
}

export interface CorpWalletDivisionSnapshot {
  division: number;
  balance: number;
  /**
   * Only the master division's journal is fetched (CONTEXT.md round 43): ESI
   * publishes no all-divisions journal and the seven are separately paginated
   * and role-gated, so every other division's `journal` is empty here — its
   * `balance` still participates in the balance-below check below, which
   * costs nothing extra since `/wallets` already returns every division in
   * one call.
   */
  journal: readonly CorpWalletJournalEntrySnapshot[];
  /** The Character's current thresholds, baked in at `load()` time — see `StructureFuelEntrySnapshot`. */
  balanceFloorIsk: number;
  transactionCeilingIsk: number;
}

export interface CorpWalletSnapshot {
  divisions: readonly CorpWalletDivisionSnapshot[];
  nowMs: number;
}

export type CorpWalletThresholdFire =
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'balanceBelow';
      division: number;
      balance: number;
      thresholdIsk: number;
    }
  | {
      eventId: 'corpWalletThreshold';
      characterId: number;
      kind: 'transactionAbove';
      division: number;
      amount: number;
      thresholdIsk: number;
      /** The journal entry's own id (issue #348: Occurrence Key input) — this diff's own natural id for this case (see below). */
      journalEntryId: number;
    };

/**
 * Fires on either of two independent conditions (issue #299), deliberately
 * not modelled on `diffWalletBalanceChanged` (which would flood at corp
 * transaction volume):
 *
 * - **`balanceBelow`** — a division's balance newly at or under the
 *   Character's floor, edge-triggered across every division `/wallets`
 *   returns (one call already prices in all seven).
 * - **`transactionAbove`** — a single journal entry, on the master division
 *   only, whose absolute amount newly exceeds the Character's ceiling.
 *   High-water-marked by entry id, `diffWalletBalanceChanged`'s precedent: an
 *   entry once seen is never re-evaluated even if the ceiling is lowered
 *   later, so changing the setting affects only transactions from then on.
 *
 * `prev === undefined` fires nothing, this module's rule throughout — a
 * division discovered already under floor, or a backlog of large historical
 * transactions, must not flood the first time this poll has a baseline.
 */
export function diffCorpWalletThreshold(
  characterId: number,
  prev: CorpWalletSnapshot | undefined,
  next: CorpWalletSnapshot
): CorpWalletThresholdFire[] {
  if (!prev) return [];
  const prevByDivision = new Map(prev.divisions.map((division) => [division.division, division]));
  const fires: CorpWalletThresholdFire[] = [];
  for (const division of next.divisions) {
    if (division.balance <= division.balanceFloorIsk) {
      const prevDivision = prevByDivision.get(division.division);
      // Judged against `prevDivision.balanceFloorIsk` — the floor that was
      // live when `prevDivision.balance` was measured — never
      // `division.balanceFloorIsk` again: reusing the current floor for both
      // sides would make raising it retroactively read every earlier poll as
      // "already under," so a division genuinely newly eligible would never
      // fire (same reasoning `diffStructureFuelLow` documents in full).
      const wasAbove =
        prevDivision === undefined || prevDivision.balance > prevDivision.balanceFloorIsk;
      if (wasAbove) {
        fires.push({
          eventId: 'corpWalletThreshold',
          characterId,
          kind: 'balanceBelow',
          division: division.division,
          balance: division.balance,
          thresholdIsk: division.balanceFloorIsk,
        });
      }
    }

    if (division.journal.length === 0) continue;
    const prevDivision = prevByDivision.get(division.division);
    const maxPrevId = (prevDivision?.journal ?? []).reduce(
      (max, entry) => Math.max(max, entry.id),
      0
    );
    for (const entry of division.journal) {
      if (entry.id <= maxPrevId) continue;
      if (entry.amount === null) continue;
      if (Math.abs(entry.amount) < division.transactionCeilingIsk) continue;
      fires.push({
        eventId: 'corpWalletThreshold',
        characterId,
        kind: 'transactionAbove',
        division: division.division,
        amount: entry.amount,
        thresholdIsk: division.transactionCeilingIsk,
        journalEntryId: entry.id,
      });
    }
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
