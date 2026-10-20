/**
 * Dated tax rates (D3/D31): corp default → Guest default → per-feeder →
 * per-Miner → per-moon → per-record, most specific wins. The per-feeder tier
 * prices every refinery of one feeder corporation. Every rate but a per-record one
 * carries an effective-from date and applies only to days on or after it, so a
 * rate change never reaches back over days already mined. A per-record
 * override is an officer's logged correction to one Observed Mining Entry,
 * allowed only on a day not yet on a Statement.
 */

interface DatedRate {
  pct: number;
  /** First EVE/UTC day the rate applies to. */
  effectiveFrom: string;
}

export type TaxRate =
  | (DatedRate & { scope: 'corp' })
  | (DatedRate & { scope: 'guest' })
  | (DatedRate & { scope: 'feeder'; feederId: number })
  | (DatedRate & { scope: 'miner'; minerId: string })
  | (DatedRate & { scope: 'moon'; moonId: number })
  | { scope: 'record'; recordKey: string; pct: number };

export type RateScope = TaxRate['scope'];

export interface RateContext {
  date: string;
  minerId: string;
  /** The moon the refinery was drilling; undefined when unknown. */
  moonId: number | undefined;
  /** `observedEntryKey` of the Observed Mining Entry being taxed. */
  recordKey: string;
  /** The feeder corporation whose refinery recorded the entry; undefined for the book's own. */
  feederId?: number;
  /** The miner was outside the book's corporation when they mined. */
  isGuest: boolean;
}

export interface ResolvedRate {
  pct: number;
  scope: RateScope;
  /** Undefined for a per-record override, which is for one day only. */
  effectiveFrom?: string;
}

/** Most specific first. */
const SCOPE_ORDER: readonly RateScope[] = ['record', 'moon', 'miner', 'feeder', 'guest', 'corp'];

function targets(rate: TaxRate, ctx: RateContext): boolean {
  switch (rate.scope) {
    case 'record':
      return rate.recordKey === ctx.recordKey;
    case 'moon':
      return ctx.moonId !== undefined && rate.moonId === ctx.moonId;
    case 'feeder':
      return ctx.feederId !== undefined && rate.feederId === ctx.feederId;
    case 'miner':
      return rate.minerId === ctx.minerId;
    case 'guest':
      return ctx.isGuest;
    case 'corp':
      return true;
  }
}

/** The rate in effect for one Observed Mining Entry, or undefined when the book had none yet. */
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

/** A new rate dated before today would reprice days already mined. */
export function isRetroactiveRate(effectiveFrom: string, today: string): boolean {
  return effectiveFrom < today;
}

/** A per-record override is allowed only on a day not yet on any of the Miner's Statements. */
export function canOverrideRecordRate(
  date: string,
  daysOnStatements: ReadonlySet<string>
): boolean {
  return !daysOnStatements.has(date);
}
