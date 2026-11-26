import type { StockBoardData } from '@/features/stockTargets/stockBoard';
import { formatIskCompact } from '@/lib/isk';
import { isJobDone } from '@/features/industry/jobs';
import {
  needsAttentionCount,
  notCheckedCount,
  openOrderProblemCounts,
} from '@/features/market/openOrdersModel';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import { compareSeverity } from '@/engine/character/severity';
import { formatCountdown } from '@/lib/duration';
import { extractableSp, extractorCount, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { formatCompactNumber } from '@/lib/compactNumber';
import { structureCounts } from './corpCards';
import type {
  ContractsBoardData,
  MailBoardData,
  IndustryBoardData,
  MiningTaxBoardData,
  MoonChunksBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  SpExtractionBoardData,
  StructuresView,
} from './boardData';
import type { Translate } from '@/lib/translate';

const CHECKING = 'overview.board.checking';
const REAUTH = 'overview.board.reauth';

export function ordersSummary(
  t: Translate,
  rows: readonly OpenOrderRow[] | null,
  needsReauth: boolean
): string {
  if (needsReauth) return t(REAUTH);
  if (rows === null) return t(CHECKING);
  const counts = openOrderProblemCounts(rows);
  if (counts.belowFloor > 0) return t('overview.board.belowFloor', { count: counts.belowFloor });
  const needsWork = needsAttentionCount(rows);
  if (needsWork > 0) return t('overview.board.ordersMeta', { count: needsWork });
  const unchecked = notCheckedCount(rows);
  return unchecked > 0
    ? t('overview.board.ordersNotChecked', { count: unchecked })
    : t('overview.board.ordersClear');
}

export function miningTaxSummary(t: Translate, data: MiningTaxBoardData | null): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  if (data.unpaidIsk > 0)
    return t('overview.board.miningUnpaid', { isk: formatIskCompact(data.unpaidIsk) });
  return data.unassignedCount > 0
    ? t('overview.board.miningUnassigned', { count: data.unassignedCount })
    : t('overview.board.miningSettled');
}

export function planetarySummary(t: Translate, data: PlanetaryBoardData | null): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  const worst = [...data.batches].sort((a, b) => compareSeverity(a.severity, b.severity))[0];
  if (worst === undefined) return t('overview.board.noColonies');
  return t(`overview.board.batch.${worst.kind}`, { count: worst.colonies.length });
}

export function industrySummary(
  t: Translate,
  data: IndustryBoardData | null,
  nowMs: number
): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  const done = data.jobs.filter((job) => isJobDone(job, nowMs)).length;
  if (done > 0) return t('overview.board.jobsReady', { count: done });
  const running = data.jobs.length - done;
  return running > 0
    ? t('overview.board.industryRunning', { count: running })
    : t('overview.board.industryIdle');
}

export function contractsDeadlineNote(t: Translate, data: ContractsBoardData): string | null {
  const { soonest } = data.summary;
  if (soonest === null) return null;
  if (soonest.kind === 'listing') return t('overview.board.contractsListingExpires');
  const note = t(
    soonest.overdue
      ? 'overview.board.contractsCourierOverdue'
      : 'overview.board.contractsCourierDue'
  );
  return data.route === null ? note : `${note} · ${data.route}`;
}

export function contractsSummary(
  t: Translate,
  data: ContractsBoardData | null,
  nowMs: number
): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  const { inProgress, outstanding, overdue, soonest } = data.summary;
  const parts: string[] = [];
  if (inProgress > 0) parts.push(t('overview.board.contractsInProgress', { count: inProgress }));
  if (overdue > 0) {
    parts.push(t('overview.board.contractsOverdue', { count: overdue }));
  } else if (soonest !== null) {
    const duration = formatCountdown(Math.max(0, soonest.atMs - nowMs) / 1000);
    parts.push(
      t(
        soonest.kind === 'listing'
          ? 'overview.board.contractsListingIn'
          : 'overview.board.contractsNextDue',
        { duration }
      )
    );
  }
  if (parts.length === 0 && outstanding > 0) {
    parts.push(t('overview.board.contractsOutstanding', { count: outstanding }));
  }
  return parts.length > 0 ? parts.join(' · ') : t('overview.board.contractsNothingDue');
}

export function spExtractionSummary(t: Translate, data: SpExtractionBoardData): string {
  if (data.totalSp === null) return t(CHECKING);
  if (data.monitoring && isSpExtractionReady(data.totalSp, data.thresholdSp)) {
    return t('overview.board.spExtractionReady', { count: extractorCount(data.totalSp) });
  }
  return t('overview.board.spExtractable', {
    sp: formatCompactNumber(extractableSp(data.totalSp)),
  });
}

export function mailSummary(t: Translate, data: MailBoardData | null): string {
  if (data === null) return t(CHECKING);
  if (data.needsReauth) return t(REAUTH);
  return data.unread > 0
    ? t('overview.board.mailUnread', { count: data.unread })
    : t('overview.board.mailNone');
}

export function priceAlertsSummary(t: Translate, data: PriceAlertsBoardData | null): string {
  if (data === null) return t(CHECKING);
  const crossed = data.alerts.filter((alert) => alert.crossed).length;
  if (crossed > 0) return t('overview.board.priceAlertsCrossed', { count: crossed });
  if (data.alerts.length > 0) {
    return t('overview.board.priceAlertsWatching', { count: data.alerts.length });
  }
  return t('overview.board.priceAlertsNone');
}

export function stockBoardSummary(t: Translate, data: StockBoardData | null): string {
  if (data === null || !data.counted) return t(CHECKING);
  const { out, low } = data.totals;
  if (out > 0 || low > 0) return t('overview.board.stockSummary', { out, low });
  return t('overview.board.stockAllStocked');
}

export function structuresSummary(t: Translate, data: StructuresView | null): string {
  if (data === null) return t(CHECKING);
  if (data.items === null) return t(data.needsReauth ? REAUTH : 'overview.board.corpUnreadable');
  const counts = structureCounts(data.items);
  if (counts.timers > 0) return t('overview.board.structuresTimers', { count: counts.timers });
  if (counts.lowFuel > 0) return t('overview.board.structuresLowFuel', { count: counts.lowFuel });
  if (counts.offline > 0) return t('overview.board.structuresOffline', { count: counts.offline });
  return t('overview.board.structuresFine', { count: data.structureCount });
}

export function moonChunksSummary(
  t: Translate,
  data: MoonChunksBoardData | null,
  nowMs: number
): string {
  if (data === null) return t(CHECKING);
  if (data.chunks === null) return t(data.needsReauth ? REAUTH : 'overview.board.corpUnreadable');
  const ready = data.chunks.filter((chunk) => chunk.detail === 'decay').length;
  if (ready > 0) return t('overview.board.moonChunksReady', { count: ready });
  const next = data.chunks
    .filter((chunk) => chunk.detail === 'arrival' && chunk.deadlineMs > nowMs)
    .sort((a, b) => a.deadlineMs - b.deadlineMs)[0];
  if (next === undefined) return t('overview.board.moonChunksNone');
  return t('overview.board.moonChunksNext', {
    when: formatCountdown((next.deadlineMs - nowMs) / 1000),
  });
}
