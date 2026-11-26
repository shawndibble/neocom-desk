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

export function ownContractAskingPrice(contract: Contract): number {
  if ((contract.buyout ?? 0) > 0) return contract.buyout!;
  return (contract.price ?? 0) > 0 ? contract.price! : 0;
}

const BLUEPRINT_COPY = -2;

const toLine = (item: ContractItem): PriceCheckLine => ({
  typeId: item.type_id,
  quantity: item.quantity,
  ...(item.raw_quantity === BLUEPRINT_COPY ? { unpriceable: true as const } : {}),
});

export function useOwnContractPriceCheck({
  contract,
  items,
  hub,
  isAbyssalType,
}: {
  contract: Contract;
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
    hubArea: 'contracts',
    defaultSide: 'buy',
    sellOverrides,
  });
}
