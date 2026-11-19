import type { ContractAskEstimate } from '@/engine/contracts/askEstimate';
import { formatIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

/** What a contract-only hull's value cell shows in place of a dash. */
export interface AskEstimateFigure {
  /** ISK for the whole stack. */
  value: number;
  /** The tooltip: the median, N contracts, and that it is not in the total. */
  hint: string;
}

/**
 * The marked ask estimate for one stack, or undefined: only a stack with no
 * value of its own (market price, copy or abyssal estimate) takes one.
 */
export function askEstimateFigure(
  asset: { type_id: number; quantity: number },
  estimates: ReadonlyMap<number, ContractAskEstimate>,
  ownValue: number,
  t: Translate
): AskEstimateFigure | undefined {
  if (ownValue !== 0) return undefined;
  const estimate = estimates.get(asset.type_id);
  if (!estimate) return undefined;
  return {
    value: estimate.unitPrice * asset.quantity,
    hint: t('assets.askEstimate.rowHint', {
      price: formatIsk(estimate.unitPrice, 0),
      count: estimate.contracts,
    }),
  };
}
