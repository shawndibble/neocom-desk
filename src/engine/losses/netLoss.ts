import type { KillmailVictim } from '@/engine/fittings/linkLoader';
import { parseInstant } from '../esiInstant';
import { MINUTE_MS, HOUR_MS } from '@/lib/age';

export interface LossInsurance {
  amount: number;
  estimate: boolean;
}

export interface NetLoss {
  hull: number;
  fitted: number;
  cargo: number;
  dropped: number;
  lost: number;
  insurance: LossInsurance | null;
  net: number;
  zkbValue: number | null;
  unpricedTypes: number[];
  abyssalItems: number;
}

function isFittedFlag(flag: number): boolean {
  return (flag >= 11 && flag <= 34) || (flag >= 92 && flag <= 99) || (flag >= 125 && flag <= 132);
}

export function computeNetLoss(input: {
  victim: KillmailVictim;
  prices: ReadonlyMap<number, number | null>;
  insurance: LossInsurance | null;
  zkbValue: number | null;
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

export interface InsuranceJournalRow {
  id: number;
  date: string;
  ref_type: string;
  amount?: number;
  description: string;
}

export const INSURANCE_WINDOW_MS = HOUR_MS;
const INSURANCE_SKEW_MS = 5 * MINUTE_MS;

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
