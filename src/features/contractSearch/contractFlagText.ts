import type { TFunction } from 'i18next';
import type { ContractFlag } from '@/engine/contracts/contractFlags';
import { formatCount } from '@/lib/formatCount';
import { CONTRACT_ISK_CENTS_BELOW, formatContractIsk, formatIskAuto } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import type { Translate } from '@/lib/translate';

export function auctionKindLabel(t: Translate, buyout: number | undefined): string {
  return t(buyout ? 'contractSearch.buyoutShort' : 'contractSearch.startingBidShort');
}

export function flagLabel(flag: ContractFlag, t: Translate): string {
  return t(
    flag.kind === 'overpriced'
      ? 'contractSearch.flag.overpricedLabel'
      : 'contractSearch.flag.copyLabel'
  );
}

export function flagMultiple(flag: ContractFlag): number {
  return flag.kind === 'overpriced' ? flag.multiple : flag.asking / flag.original;
}

export function flagReferencePrice(flag: ContractFlag): number {
  return flag.kind === 'overpriced' ? flag.hubSell * flag.quantity : flag.original;
}

export function flagHint(flag: ContractFlag, hub: TradeHub, t: TFunction): string {
  return flag.kind === 'overpriced'
    ? t('contractSearch.flag.overpricedHint', {
        times: formatCount(Math.round(flag.multiple)),
        hub: hub.systemName,
      })
    : t('contractSearch.flag.copyHint', {
        times: (Math.round(flagMultiple(flag) * 10) / 10).toString(),
        region: hub.regionName,
        price: formatIskAuto(flag.original, CONTRACT_ISK_CENTS_BELOW),
      });
}

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
