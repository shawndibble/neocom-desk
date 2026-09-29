/**
 * How urgent each card is — one answer per domain, read twice.
 *
 * The card's own header wears it as a word, and on a phone its folded row in
 * "Everything else" wears it as a glyph. Two independent judgements would
 * drift the first time either changed. It never reorders anything: where a
 * card sits is the pilot's order (`cardOrder.ts`).
 *
 * `null` means "not loaded yet", and is deliberately not `clear`: a card whose
 * read has not landed printing "Clear" beside a footer saying "Checking…" is
 * the same silence this board was rebuilt to remove.
 */
import { worstSeverity, type DeadlineSeverity } from '@/engine/severity';
import { isCompletingSoon, isJobDone } from '@/features/industry/jobs';
import type { IndustryJob } from '@/esi/endpoints';
import { openOrderProblemCounts } from '@/features/market/openOrdersModel';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { upcomingCommittedEvents } from '@/engine/calendarDeadline';
import { isSpExtractionReady } from '@/engine/spExtraction';
import { DAY_MS } from '@/lib/age';
import type {
  CalendarEventsBoardData,
  ContractsBoardData,
  MailBoardData,
  MiningTaxBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  SpExtractionBoardData,
} from './boardData';

/**
 * A lapsed grant is `warning`, never `clear`.
 *
 * The card cannot answer its own question, and a board that sorts an
 * unanswerable card to the bottom hides the one thing the reader could
 * actually fix — logging in again.
 */
const UNREADABLE: DeadlineSeverity = 'warning';

/**
 * Null while the snapshot is still in flight, like every other domain here.
 * An empty row list is what both "no orders" and "not fetched yet" look like,
 * and the second one answering `clear` would claim an all-clear the card has
 * not checked yet.
 */
export function ordersSeverity(
  rows: readonly OpenOrderRow[] | null,
  needsReauth: boolean
): DeadlineSeverity | null {
  if (needsReauth) return UNREADABLE;
  if (rows === null) return null;
  const counts = openOrderProblemCounts(rows);
  if (counts.belowFloor > 0) return 'critical';
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  if (undercut > 0 || counts.outbid > 0) return 'warning';
  return counts.expiringOrStale > 0 ? 'watch' : 'clear';
}

/** Unpaid tax is a routine debt, not an emergency, until it has sat this long. */
export const MINING_TAX_WARNING_DAYS = 30;

export function miningTaxSeverity(data: MiningTaxBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  if (data.unpaidIsk > 0) {
    const aged = data.oldestUnpaidDays !== null && data.oldestUnpaidDays >= MINING_TAX_WARNING_DAYS;
    return aged ? 'warning' : 'watch';
  }
  return data.unassignedCount > 0 ? 'watch' : 'clear';
}

export function planetarySeverity(data: PlanetaryBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  return worstSeverity(data.batches.map((batch) => batch.severity));
}

/** A running job is never worse than `watch` — it is doing what it was told. Only a finished one waits on you. */
export function jobSeverity(job: IndustryJob, nowMs: number): DeadlineSeverity {
  return isCompletingSoon(job, nowMs) ? 'watch' : 'clear';
}

export function industrySeverity(
  jobs: readonly IndustryJob[],
  needsReauth: boolean,
  nowMs: number
): DeadlineSeverity {
  if (needsReauth) return UNREADABLE;
  const severities = jobs
    .filter((job) => !isJobDone(job, nowMs))
    .map((job) => jobSeverity(job, nowMs));
  if (jobs.some((job) => isJobDone(job, nowMs))) severities.push('warning');
  return worstSeverity(severities);
}

/** A courier past its deliver-by forfeits the collateral, so it is the one `critical`; anything else due inside a day is `warning`. */
export function contractsSeverity(data: ContractsBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  if (data.summary.overdue > 0) return 'critical';
  return data.summary.dueSoon > 0 ? 'warning' : 'clear';
}

/** How soon a committed calendar event has to be before the card flags it. */
const COMING_UP_WATCH_MS = DAY_MS;

/** One event's row tone: `watch` within a day, `clear` beyond. */
export function comingUpEventSeverity(atMs: number, nowMs: number): DeadlineSeverity {
  return atMs - nowMs <= COMING_UP_WATCH_MS ? 'watch' : 'clear';
}

/**
 * A committed event is a plan, not a problem, so this never goes past
 * `watch`: one starting within a day is worth a glance, and anything further
 * out is clear. The strip's Next deadline still rates the same event on the
 * full ladder, because there it is competing with real deadlines.
 */
export function comingUpSeverity(
  data: CalendarEventsBoardData | null,
  nowMs: number
): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  const next = upcomingCommittedEvents(data.events, nowMs)[0];
  return next === undefined ? 'clear' : comingUpEventSeverity(next.atMs, nowMs);
}

/**
 * Spare SP is an opportunity, not a fault, so ready is `watch` at most — and
 * only when the pilot switched monitoring on. The card still shows the number
 * with monitoring off; it just never claims anything is waiting.
 */
export function spExtractionSeverity(data: SpExtractionBoardData): DeadlineSeverity | null {
  if (data.totalSp === null) return null;
  if (!data.monitoring) return 'clear';
  return isSpExtractionReady(data.totalSp, data.thresholdSp) ? 'watch' : 'clear';
}

/** Unread mail is worth a look, never an emergency. */
export function mailSeverity(data: MailBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  return data.unread > 0 ? 'watch' : 'clear';
}

/** A crossed target is what the pilot asked to be told about, so it is `warning`. */
export function priceAlertsSeverity(data: PriceAlertsBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  return data.alerts.some((alert) => alert.crossed) ? 'warning' : 'clear';
}
