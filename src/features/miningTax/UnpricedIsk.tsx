import { IskAmount } from '@/components/ui';
import { nothingPriced, type EntryValuation } from '@/engine/miningTax/yieldValuation';

export function UnpricedIsk({ valuation, value }: { valuation: EntryValuation; value: number }) {
  return nothingPriced(valuation) ? <>—</> : <IskAmount value={value} decimals={0} />;
}
