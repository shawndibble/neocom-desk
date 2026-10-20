/**
 * The price check on an own contract's detail panel. A contract that is over is
 * checked at the hub station's Open Price of the UTC day it was issued, since
 * what it was worth then is the question; one that can still be taken is
 * checked against the live book. The default side is Buy (decision
 * 20261020-005242-contract-detail-price-check). The shared work is
 * `useContractPriceCheck`.
 */
import { useMemo } from 'react';
import type { PriceCheckLine } from '@/engine/contracts/contractPriceCheck';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { isActiveContractStatus } from '@/engine/contracts/contractStatus';
import { usePlexPrice } from '@/features/market/plexPrice';
import type { Contract, ContractItem } from '@/esi/endpoints';
import {
  useContractPriceCheck,
  type ContractPriceCheckView,
} from '@/features/contracts/useContractPriceCheck';
import type { PriceBasisChoice } from '@/features/contracts/contractPrices';
import type { TradeHub } from '@/market/hubs';

/**
 * The ISK an own contract asks: a buyout where there is one (an auction is
 * judged on what taking it now costs, not its starting bid), else the price.
 * 0 for no ISK ask. Distinct from Contract Search's `offerAskingPrice`, which
 * reads a snapshot row.
 */
export function ownContractAskingPrice(contract: Contract): number {
  if ((contract.buyout ?? 0) > 0) return contract.buyout!;
  return (contract.price ?? 0) > 0 ? contract.price! : 0;
}

const toLine = (item: ContractItem): PriceCheckLine => ({
  typeId: item.type_id,
  quantity: item.quantity,
});

/** `null` when there is nothing to compare: no items, or no ISK ask and nothing requested. */
export function useOwnContractPriceCheck({
  contract,
  items,
  hub,
  isAbyssalType,
}: {
  contract: Contract;
  /** `undefined` until the item read settles. */
  items: readonly ContractItem[] | undefined;
  hub: TradeHub;
  isAbyssalType?: (typeId: number) => boolean;
}): ContractPriceCheckView | null {
  const asking = ownContractAskingPrice(contract);
  const day = contract.date_issued.slice(0, 10);
  const over = !isActiveContractStatus(contract.status);

  const lines = useMemo(() => {
    const abyssal = (item: ContractItem) => isAbyssalType?.(item.type_id) ?? false;
    const all = items ?? [];
    return {
      included: all.filter((i) => i.is_included && !abyssal(i)).map(toLine),
      requested: all.filter((i) => !i.is_included && !abyssal(i)).map(toLine),
      anyIncluded: all.some((i) => i.is_included),
    };
  }, [items, isAbyssalType]);

  const basis = useMemo<PriceBasisChoice>(
    () => (over ? { kind: 'day', date: day } : { kind: 'live' }),
    [over, day]
  );

  // PLEX trades only on its own market, so no hub lists it: price it from
  // there, on a live check only (today's PLEX price is not a past day's).
  const hasPlex =
    !over && [...lines.included, ...lines.requested].some((line) => line.typeId === PLEX_TYPE_ID);
  const plexPrice = usePlexPrice(hasPlex);
  const sellOverrides = useMemo(
    () => (plexPrice === null ? undefined : new Map([[PLEX_TYPE_ID, plexPrice]])),
    [plexPrice]
  );

  return useContractPriceCheck({
    identity: String(contract.contract_id),
    enabled: items !== undefined && lines.anyIncluded && (lines.requested.length > 0 || asking > 0),
    included: lines.included,
    requested: lines.requested,
    asking,
    basis,
    hub,
    defaultSide: 'buy',
    sellOverrides,
  });
}
