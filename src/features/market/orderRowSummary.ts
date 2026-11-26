import type { UndercutScope } from '@/engine/market/undercut';
import { undercutPrice, outbidPrice } from '@/engine/market/priceTick';
import type { OpenOrderRow } from './openOrdersModel';

export type OrderAdviceInput = Pick<
  OpenOrderRow,
  | 'problem'
  | 'floor'
  | 'station'
  | 'ownRival'
  | 'deepUndercut'
  | 'worstScope'
  | 'expiry'
  | 'isBuyOrder'
  | 'price'
  | 'costBasis'
  | 'frequentlyUndercut'
  | 'competitionUnchecked'
  | 'volumeRemain'
  | 'turnInEach'
>;

export interface MatchOutcome {
  kind: 'profit' | 'loss';
  amount: number;
}

export type OrderRowSummary =
  | {
      kind: 'undercut';
      scope: UndercutScope;
      rivalPrice: number;
      gapIsk: number;
      sellersUnderMe: number | null;
      suggestedPrice: number | null;
      match: MatchOutcome | null;
    }
  | { kind: 'belowFloor'; lossPerUnit: number }
  | { kind: 'expiring'; daysLeft: number | null; volumeRemain: number }
  | {
      kind: 'outbid';
      rivalPrice: number;
      gapIsk: number;
      sellersUnderMe: number | null;
      suggestedPrice: number | null;
    }
  | { kind: 'ownRival'; characterName: string; price: number }
  | { kind: 'noCostBasis' }
  | { kind: 'best' }
  | { kind: 'topBid' };

function matchOutcome(row: OrderAdviceInput, suggestedPrice: number | null): MatchOutcome | null {
  if (row.isBuyOrder || !row.floor || suggestedPrice === null) return null;
  const margin = suggestedPrice - row.floor.relist;
  return margin >= 0 ? { kind: 'profit', amount: margin } : { kind: 'loss', amount: -margin };
}

function rivalFor(
  row: OrderAdviceInput,
  scope: UndercutScope
): { price: number; gapIsk: number; sellersUnderMe: number | null } | null {
  const deep = row.deepUndercut?.byScope[scope];
  if (deep) {
    return { price: deep.price, gapIsk: deep.gapIsk, sellersUnderMe: deep.ordersBeatingMe };
  }
  if (scope !== 'station' || !row.station.beatsMe || row.station.bestPrice === null) return null;
  return { price: row.station.bestPrice, gapIsk: row.station.gapIsk, sellersUnderMe: null };
}

export function orderRowSummary(row: OrderAdviceInput): OrderRowSummary | null {
  switch (row.problem) {
    case 'belowFloor':
      if (!row.floor) return null;
      return { kind: 'belowFloor', lossPerUnit: row.floor.relist - row.price };
    case 'undercutStation':
    case 'undercutSystem':
    case 'undercutRegion': {
      const scope: UndercutScope =
        row.problem === 'undercutStation'
          ? 'station'
          : row.problem === 'undercutSystem'
            ? 'system'
            : 'region';
      const rival = rivalFor(row, scope);
      if (!rival) return null;
      const suggestedPrice = undercutPrice(rival.price);
      return {
        kind: 'undercut',
        scope,
        rivalPrice: rival.price,
        gapIsk: rival.gapIsk,
        sellersUnderMe: rival.sellersUnderMe,
        suggestedPrice,
        match: matchOutcome(row, suggestedPrice),
      };
    }
    case 'expiringOrStale':
      return {
        kind: 'expiring',
        daysLeft: row.expiry?.daysLeft ?? null,
        volumeRemain: row.volumeRemain,
      };
    case 'outbid': {
      const scope = row.worstScope;
      const rival = scope ? rivalFor(row, scope) : null;
      if (!rival) return null;
      return {
        kind: 'outbid',
        rivalPrice: rival.price,
        gapIsk: rival.gapIsk,
        sellersUnderMe: rival.sellersUnderMe,
        suggestedPrice: outbidPrice(rival.price),
      };
    }
    case 'healthy':
    default:
      if (row.ownRival) {
        return {
          kind: 'ownRival',
          characterName: row.ownRival.characterName,
          price: row.ownRival.price,
        };
      }
      if (!row.isBuyOrder && row.costBasis === null) return { kind: 'noCostBasis' };
      if (row.station.bestPrice !== null) return { kind: row.isBuyOrder ? 'topBid' : 'best' };
      return null;
  }
}
