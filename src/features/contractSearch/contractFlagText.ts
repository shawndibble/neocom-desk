/**
 * The Items board's flag sentences (#4773): the short tooltip and the detail
 * slide-over's fuller one. The condition and its multiple, never a verdict.
 */
import type { TFunction } from 'i18next';
import type { ContractFlag } from '@/engine/contracts/contractFlags';
import { formatCount } from '@/lib/formatCount';
import { CONTRACT_ISK_CENTS_BELOW, formatContractIsk, formatIskAuto } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';

/** The short tooltip sentence: the condition and its multiple, never a verdict. */
export function flagHint(flag: ContractFlag, hub: TradeHub, t: TFunction): string {
  return flag.kind === 'overpriced'
    ? t('contractSearch.flag.overpricedHint', {
        times: formatCount(Math.round(flag.multiple)),
        hub: hub.systemName,
      })
    : t('contractSearch.flag.copyHint', {
        times: (Math.round((flag.asking / flag.original) * 10) / 10).toString(),
        region: hub.regionName,
        price: formatIskAuto(flag.original, CONTRACT_ISK_CENTS_BELOW),
      });
}

/** The detail slide-over's fuller sentence: the same condition with what it would cost instead. */
export function flagDetail(flag: ContractFlag, hub: TradeHub, t: TFunction): string {
  if (flag.kind === 'overpriced') {
    return t('contractDetail.flagOverpriced', {
      times: formatCount(Math.round(flag.multiple)),
      hub: hub.systemName,
      unit: formatContractIsk(flag.hubSell),
      count: flag.quantity,
      cost: formatContractIsk(flag.hubSell * flag.quantity),
    });
  }
  const values = {
    price: formatContractIsk(flag.asking),
    original: formatContractIsk(flag.original),
    region: hub.regionName,
  };
  return flag.runs === undefined
    ? t('contractDetail.flagCopyNoRuns', values)
    : t('contractDetail.flagCopy', { ...values, runs: flag.runs });
}
