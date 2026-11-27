import {
  severityForRemaining,
  worstSeverity,
  type DeadlineSeverity,
} from '@/engine/character/severity';
import { isCompletingSoon, isJobDone } from '@/features/industry/jobs';
import type { IndustryJob } from '@/esi/endpoints';
import { openOrderProblemCounts } from '@/features/market/openOrdersModel';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { isSpExtractionReady } from '@/engine/skills/spExtraction';
import type {
  ContractsBoardData,
  MailBoardData,
  MiningTaxBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  SpExtractionBoardData,
} from './boardData';

const UNREADABLE: DeadlineSeverity = 'warning';

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

export function contractsSeverity(data: ContractsBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  if (data.summary.overdue > 0) return 'critical';
  return data.summary.dueSoon > 0 ? 'warning' : 'clear';
}

export function comingUpEventSeverity(atMs: number, nowMs: number): DeadlineSeverity {
  return severityForRemaining(atMs - nowMs);
}

export function spExtractionSeverity(data: SpExtractionBoardData): DeadlineSeverity | null {
  if (data.totalSp === null) return null;
  if (!data.monitoring) return 'clear';
  return isSpExtractionReady(data.totalSp, data.thresholdSp) ? 'watch' : 'clear';
}

export function mailSeverity(data: MailBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  if (data.needsReauth) return UNREADABLE;
  return 'clear';
}

export function priceAlertsSeverity(data: PriceAlertsBoardData | null): DeadlineSeverity | null {
  if (data === null) return null;
  return data.alerts.some((alert) => alert.crossed) ? 'warning' : 'clear';
}
