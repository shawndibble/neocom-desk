/**
 * Contract stock for the net worth chart (issue #5128): what a Character has
 * locked in its own open contracts. Items leave the asset list and a courier
 * reward leaves the wallet, so without this layer the chart dips until the
 * contract ends. Pure — the fetching lives in `features/netWorth`.
 *
 * Counted at item value, never at contract price (what a buyer would pay the
 * Character) and never courier collateral (escrowed by the courier): either
 * would sum one party's money into another's net worth.
 */
import { isActiveContractStatus } from '@/engine/contracts/contractStatus';
import type { Contract } from '@/esi/endpoints';
import { parseInstant } from '../esiInstant';

export type StockContract = Pick<
  Contract,
  'contract_id' | 'issuer_id' | 'type' | 'status' | 'for_corporation' | 'date_expired' | 'reward'
>;

export interface StockContractItem {
  record_id: number;
  type_id: number;
  quantity: number;
  /** True when the issuer hands this over; false is what the acceptor must supply. */
  is_included: boolean;
  /** -2 is a blueprint copy. */
  raw_quantity?: number;
}

function isOpenOwnContract(contract: StockContract, characterId: number, now: number): boolean {
  if (contract.issuer_id !== characterId || contract.for_corporation) return false;
  if (!isActiveContractStatus(contract.status)) return false;
  // An expired contract stays outstanding in ESI until its items are returned.
  const expires = parseInstant(contract.date_expired);
  return expires === null || expires > now;
}

function isItemContract(contract: StockContract): boolean {
  return contract.type === 'item_exchange' || contract.type === 'auction';
}

/** The Character's own open item-exchange and auction contracts: the ones whose items need reading. */
export function openIssuedItemContracts(
  contracts: readonly StockContract[],
  characterId: number,
  now: number
): StockContract[] {
  return contracts.filter((c) => isItemContract(c) && isOpenOwnContract(c, characterId, now));
}

/** `null` when a line cannot be valued: the whole contract is then left out rather than guessed. */
function itemsValue(
  items: readonly StockContractItem[],
  priceByTypeId: ReadonlyMap<number, number>
): number | null {
  let total = 0;
  for (const line of items) {
    if (!line.is_included) continue;
    const price = priceByTypeId.get(line.type_id);
    // A blueprint copy has no price of its own, so its contract cannot be valued.
    if (price === undefined || line.raw_quantity === -2) return null;
    total += line.quantity * price;
  }
  return total;
}

export function contractStockValue(input: {
  characterId: number;
  now: number;
  contracts: readonly StockContract[];
  /** Items by contract id; `null` or absent = not read. */
  itemsByContractId: ReadonlyMap<number, readonly StockContractItem[] | null>;
  priceByTypeId: ReadonlyMap<number, number>;
}): number {
  let total = 0;
  for (const contract of input.contracts) {
    if (!isOpenOwnContract(contract, input.characterId, input.now)) continue;
    if (contract.type === 'courier') {
      total += contract.reward ?? 0;
    } else if (isItemContract(contract)) {
      const items = input.itemsByContractId.get(contract.contract_id);
      if (items) total += itemsValue(items, input.priceByTypeId) ?? 0;
    }
  }
  return total;
}
