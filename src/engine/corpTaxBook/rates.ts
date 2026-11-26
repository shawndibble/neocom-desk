import { shiftUtcDate } from '../localDay';

interface DatedRate {
  pct: number;
  effectiveFrom: string;
}

export type TaxRate =
  | (DatedRate & { scope: 'corp' })
  | (DatedRate & { scope: 'guest' })
  | (DatedRate & { scope: 'feeder'; feederId: number })
  | (DatedRate & { scope: 'feeder-member'; feederId: number })
  | (DatedRate & { scope: 'miner'; minerId: string })
  | (DatedRate & { scope: 'moon'; moonId: number })
  | (DatedRate & { scope: 'structure'; structureId: number })
  | { scope: 'record'; recordKey: string; pct: number };

export type RateScope = TaxRate['scope'];

export interface RateContext {
  date: string;
  minerId: string;
  moonId: number | undefined;
  structureId?: number;
  recordKey: string;
  feederId?: number;
  isGuest: boolean;
  minerCorporationId?: number;
}

export interface ResolvedRate {
  pct: number;
  scope: RateScope;
  effectiveFrom?: string;
}

export const SCOPE_ORDER: readonly RateScope[] = [
  'record',
  'miner',
  'moon',
  'structure',
  'feeder-member',
  'feeder',
  'guest',
  'corp',
];

function targets(rate: TaxRate, ctx: RateContext): boolean {
  switch (rate.scope) {
    case 'record':
      return rate.recordKey === ctx.recordKey;
    case 'moon':
      return ctx.moonId !== undefined && rate.moonId === ctx.moonId;
    case 'structure':
      return ctx.structureId !== undefined && rate.structureId === ctx.structureId;
    case 'feeder':
      return ctx.feederId !== undefined && rate.feederId === ctx.feederId;
    case 'feeder-member':
      return (
        ctx.feederId !== undefined &&
        rate.feederId === ctx.feederId &&
        ctx.minerCorporationId === rate.feederId
      );
    case 'miner':
      return rate.minerId === ctx.minerId;
    case 'guest':
      return ctx.isGuest;
    case 'corp':
      return true;
  }
}

export function resolveRate(rates: readonly TaxRate[], ctx: RateContext): ResolvedRate | undefined {
  for (const scope of SCOPE_ORDER) {
    let best: TaxRate | undefined;
    for (const rate of rates) {
      if (rate.scope !== scope || !targets(rate, ctx)) continue;
      if (rate.scope === 'record') {
        best = rate;
        continue;
      }
      if (rate.effectiveFrom > ctx.date) continue;
      if (!best || (best.scope !== 'record' && rate.effectiveFrom >= best.effectiveFrom))
        best = rate;
    }
    if (best) {
      return best.scope === 'record'
        ? { pct: best.pct, scope: 'record' }
        : { pct: best.pct, scope: best.scope, effectiveFrom: best.effectiveFrom };
    }
  }
  return undefined;
}

export const MAX_RATE_BACKDATE_DAYS = 30;

export function earliestRateStart(today: string): string {
  return shiftUtcDate(today, -MAX_RATE_BACKDATE_DAYS);
}
