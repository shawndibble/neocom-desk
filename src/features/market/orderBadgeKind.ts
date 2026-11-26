import { approxIsk } from '@/features/campaigns/turnInContent';
import { fixed1 } from '@/lib/fixedFormat';
import type { Translate } from '@/lib/translate';
import type { OrderAdviceInput } from './orderRowSummary';
import type { OrderBadgeKind } from './OrderProblemBadge';

export interface OrderBadgeChoice {
  kind: OrderBadgeKind;
  detail?: string;
}

export const ORDER_BADGE_KINDS: readonly OrderBadgeKind[] = [
  'belowFloor',
  'undercutStation',
  'undercutSystem',
  'undercutRegion',
  'expiring',
  'outbid',
  'turnIn',
  'frequentlyUndercut',
  'best',
  'topBid',
  'noCostBasis',
  'notChecked',
];

export function badgeDetailText(
  t: Translate,
  kind: OrderBadgeKind,
  detail: string | undefined
): string | undefined {
  if (detail === undefined) return undefined;
  return kind === 'turnIn' ? t('market.orders.badge.turnInMore', { gain: detail }) : detail;
}

export function orderBadgeFor(row: OrderAdviceInput): OrderBadgeChoice | null {
  switch (row.problem) {
    case 'belowFloor': {
      if (!row.floor) return null;
      const pct = ((row.floor.relist - row.price) / row.floor.relist) * 100;
      return { kind: 'belowFloor', detail: `-${fixed1(pct)}%` };
    }
    case 'undercutStation':
      return { kind: 'undercutStation', detail: `-${fixed1(row.station.gapPct)}%` };
    case 'undercutSystem':
    case 'undercutRegion': {
      const pct = row.deepUndercut?.worst?.gapPct;
      return { kind: row.problem, detail: pct !== undefined ? `-${fixed1(pct)}%` : undefined };
    }
    case 'expiringOrStale': {
      const days = row.expiry?.daysLeft;
      return {
        kind: 'expiring',
        detail: days !== null && days !== undefined ? `${days}d` : undefined,
      };
    }
    case 'outbid': {
      const pct =
        row.worstScope === 'station' ? row.station.gapPct : row.deepUndercut?.worst?.gapPct;
      return { kind: 'outbid', detail: pct !== undefined ? `+${fixed1(pct)}%` : undefined };
    }
    case 'turnInPays': {
      const gain = row.turnInEach === undefined ? null : row.turnInEach - row.price;
      return { kind: 'turnIn', detail: gain !== null ? approxIsk(gain) : undefined };
    }
    case 'healthy':
    default:
      if (row.frequentlyUndercut) return { kind: 'frequentlyUndercut' };
      if (row.competitionUnchecked) return { kind: 'notChecked' };
      if (!row.isBuyOrder && row.costBasis === null) return { kind: 'noCostBasis' };
      if (row.station.bestPrice !== null) return { kind: row.isBuyOrder ? 'topBid' : 'best' };
      return null;
  }
}
