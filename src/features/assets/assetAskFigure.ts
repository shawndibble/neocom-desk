import type { ContractAskEstimate } from '@/engine/contracts/askEstimate';
import type { AskEstimateFigure } from '@/features/assets/assetBrowserRows';
import { formatIsk } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

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
