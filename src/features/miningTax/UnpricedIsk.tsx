import { IskAmount } from '@/components/ui';
import { nothingPriced, type EntryValuation } from '@/engine/miningTax/yieldValuation';

/** An ISK figure for a Mining day, or an em dash when nothing on it was priced. */
export function UnpricedIsk({ valuation, value }: { valuation: EntryValuation; value: number }) {
  return nothingPriced(valuation) ? <>—</> : <IskAmount value={value} decimals={0} />;
}
