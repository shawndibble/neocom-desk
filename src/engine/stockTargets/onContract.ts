/**
 * What a pilot is selling by contract at a market: the items of their own
 * outstanding Item Exchange contracts that start there. Items leave the asset
 * list when a contract is made, so without this a hull or module sold by
 * contract reads Out on the **Stock List** while it is for sale (issue #5974).
 *
 * Own contracts only: a corporation contract draws on a corporation hangar,
 * which the Stock List does not read. Pure — the cached reads live in
 * `features/stockTargets`.
 */
import { isOpenOwnContract, type StockContract } from '@/engine/netWorth/contractStock';
import type { Contract } from '@/esi/endpoints';
import { biggestFirst, type HolderCount } from './onHand';

export interface ContractStockInput {
  /** Whose contract list it came from: the issuer. */
  characterId: number;
  contract: Pick<
    StockContract,
    'contract_id' | 'issuer_id' | 'type' | 'status' | 'for_corporation'
  > &
    Partial<Pick<StockContract, 'date_expired'>> &
    Pick<Contract, 'start_location_id'>;
  items: readonly { type_id: number; quantity: number; is_included: boolean }[];
}

/** Per listed type, the Characters selling it by contract at the market, biggest first. */
export function contractStockAtMarket(
  inputs: readonly ContractStockInput[],
  locationId: number,
  typeIds: readonly number[],
  now: number
): Map<number, HolderCount[]> {
  const wanted = new Set(typeIds);
  const shares = new Map<number, Map<number, number>>();
  for (const { characterId, contract, items } of inputs) {
    if (contract.type !== 'item_exchange' || contract.start_location_id !== locationId) continue;
    if (!isOpenOwnContract(contract as StockContract, characterId, now)) continue;
    for (const item of items) {
      // An item the issuer asks for is what the buyer must bring, not stock on offer.
      if (!item.is_included || !wanted.has(item.type_id)) continue;
      const byCharacter = shares.get(item.type_id) ?? new Map<number, number>();
      byCharacter.set(characterId, (byCharacter.get(characterId) ?? 0) + item.quantity);
      shares.set(item.type_id, byCharacter);
    }
  }
  const result = new Map<number, HolderCount[]>();
  for (const typeId of typeIds) {
    result.set(typeId, biggestFirst(shares.get(typeId) ?? new Map()));
  }
  return result;
}
