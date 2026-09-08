/**
 * How urgent each card is — one answer per domain, read twice.
 *
 * The card's own header wears it as a word, and on a phone the board sorts by
 * it so the thing on fire is above the fold on a screen that holds three cards.
 * Two independent judgements would drift the first time either changed, and
 * they would drift *silently*, because a card can only be compared against its
 * neighbours on the one screen narrow enough to reorder them.
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
import type { MiningTaxBoardData, PlanetaryBoardData } from './boardData';

/**
 * A lapsed grant is `warning`, never `clear`.
 *
 * The card cannot answer its own question, and a board that sorts an
 * unanswerable card to the bottom hides the one thing the reader could
 * actually fix — logging in again.
 */
const UNREADABLE: DeadlineSeverity = 'warning';

export function ordersSeverity(
  rows: readonly OpenOrderRow[],
  needsReauth: boolean
): DeadlineSeverity {
  if (needsReauth) return UNREADABLE;
  const counts = openOrderProblemCounts(rows);
  if (counts.belowFloor > 0) return 'critical';
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  if (undercut > 0 || counts.outbid > 0) return 'warning';
  return counts.expiringOrStale > 0 ? 'watch' : 'clear';
}

export function miningTaxSeverity(data: MiningTaxBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  if (data.unpaidIsk > 0) return 'warning';
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
