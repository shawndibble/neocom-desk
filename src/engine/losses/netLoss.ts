/**
 * Net loss of a destroyed ship (issue #2852): hull + fitted modules + cargo
 * (including what dropped) priced from a caller-supplied price map, minus the
 * insurance payout. Insurance pays on the hull only. Pure: prices and the
 * wallet journal come in as arguments.
 */
import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { parseInstant } from '../esiInstant';
import { MINUTE_MS, HOUR_MS } from '@/lib/age';

export interface LossInsurance {
  amount: number;
  /** True when the payout was a guess (several candidates in the window). */
  estimate: boolean;
}

export interface NetLoss {
  hull: number;
  fitted: number;
  cargo: number;
  /** The part of fitted + cargo that survived as loot; already inside both totals. */
  dropped: number;
  lost: number;
  insurance: LossInsurance | null;
  net: number;
  /** zKillboard's kill-time value, for reference. */
  zkbValue: number | null;
  /** Type ids with no price; they count as zero in the totals, so the totals are partial. */
  unpricedTypes: number[];
  /**
   * Abyssal (mutated) modules on the loss, destroyed or dropped. Never priced:
   * each is worth its own rolls, and a killmail names only the type. Out of
   * the totals, like `unpricedTypes`.
   */
  abyssalItems: number;
}

/** Slot flags (low/mid/high/rig/subsystem) are fitted; every other flag is hold contents. */
function isFittedFlag(flag: number): boolean {
  return (flag >= 11 && flag <= 34) || (flag >= 92 && flag <= 99) || (flag >= 125 && flag <= 132);
}

export function computeNetLoss(input: {
  victim: KillmailVictim;
  prices: ReadonlyMap<number, number | null>;
  insurance: LossInsurance | null;
  zkbValue: number | null;
  /** Abyssal (mutated) types; omitted, none are. */
  isAbyssalType?: (typeId: number) => boolean;
}): NetLoss {
  const { victim, prices, insurance, zkbValue, isAbyssalType } = input;
  const unpriced = new Set<number>();
  let abyssalItems = 0;
  const price = (typeId: number): number => {
    const value = prices.get(typeId);
    if (value == null) {
      unpriced.add(typeId);
      return 0;
    }
    return value;
  };

  const hull = price(victim.ship_type_id);
  let fitted = 0;
  let cargo = 0;
  let dropped = 0;
  for (const item of victim.items ?? []) {
    const droppedQty = item.quantity_dropped ?? 0;
    if (isAbyssalType?.(item.item_type_id)) {
      abyssalItems += (item.quantity_destroyed ?? 0) + droppedQty;
      continue;
    }
    const unit = price(item.item_type_id);
    const value = unit * ((item.quantity_destroyed ?? 0) + droppedQty);
    if (isFittedFlag(item.flag)) fitted += value;
    else cargo += value;
    dropped += unit * droppedQty;
  }

  const lost = hull + fitted + cargo;
  return {
    hull,
    fitted,
    cargo,
    dropped,
    lost,
    insurance,
    net: lost - (insurance?.amount ?? 0),
    zkbValue,
    unpricedTypes: [...unpriced].sort((a, b) => a - b),
    abyssalItems,
  };
}

/** The wallet-journal fields insurance matching reads. */
export interface InsuranceJournalRow {
  id: number;
  date: string;
  ref_type: string;
  amount?: number;
  description: string;
}

/** Insurance pays out within minutes of the loss; later positive rows belong to other losses. */
export const INSURANCE_WINDOW_MS = HOUR_MS;
/** Journal and killmail clocks come from different services; allow a few minutes either way. */
const INSURANCE_SKEW_MS = 5 * MINUTE_MS;

/**
 * The payout for a loss: positive `insurance` journal rows (premiums are
 * negative and skipped) from the kill time to an hour after. One candidate is
 * exact; several are ambiguous, so the closest in time is returned as an
 * estimate. Null when none.
 */
export function matchInsurance(
  journal: readonly InsuranceJournalRow[],
  killTimeMs: number
): LossInsurance | null {
  const candidates = journal
    .filter((row) => row.ref_type === 'insurance' && (row.amount ?? 0) > 0)
    .flatMap((row) => {
      const at = parseInstant(row.date);
      return at === null ? [] : [{ amount: row.amount ?? 0, delta: at - killTimeMs }];
    })
    .filter(({ delta }) => delta >= -INSURANCE_SKEW_MS && delta <= INSURANCE_WINDOW_MS)
    .sort((a, b) => a.delta - b.delta);
  if (candidates.length === 0) return null;
  return { amount: candidates[0].amount, estimate: candidates.length > 1 };
}

/**
 * The loss an insurance payout belongs to: the one whose kill time is closest
 * to the payout, from a few minutes after it to an hour before. The mirror of
 * `matchInsurance`. Null when none is in the window.
 */
export function matchLossToPayout<T extends { timeMs: number }>(
  losses: readonly T[],
  payoutMs: number
): T | null {
  let best: T | null = null;
  let bestGap = Infinity;
  for (const loss of losses) {
    const gap = payoutMs - loss.timeMs;
    if (gap < -INSURANCE_SKEW_MS || gap > INSURANCE_WINDOW_MS) continue;
    if (Math.abs(gap) < bestGap) {
      best = loss;
      bestGap = Math.abs(gap);
    }
  }
  return best;
}
