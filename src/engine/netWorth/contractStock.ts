/**
 * Contract stock for the net worth chart (issue #5128): what a Character has
 * locked in its own open contracts. Items leave the asset list and a courier
 * reward leaves the wallet, so without this layer the chart dips until the
 * contract ends. Pure — the fetching lives in `features/netWorth`.
 *
 * Counted at item value, never at contract price (what a buyer would pay the
 * Character): that would sum one party's money into another's net worth. The one
 * exception is collateral the Character posted as acceptor of a running courier:
 * it is the Character's own ISK in escrow, so it counts until the real deadline
 * (`date_accepted` + `days_to_complete`, never the offer expiry).
 */
import {
  isActiveContractStatus,
  withAcceptedCourierInProgress,
} from '@/engine/contracts/contractStatus';
import { courierDeliveryDeadlineMs } from '@/engine/contracts/courierDeadline';
import type { Contract } from '@/esi/endpoints';
import { parseInstant } from '../esiInstant';

export type StockContract = Pick<
  Contract,
  | 'contract_id'
  | 'issuer_id'
  | 'acceptor_id'
  | 'type'
  | 'status'
  | 'for_corporation'
  | 'date_expired'
  | 'reward'
  | 'collateral'
  | 'days_to_complete'
  | 'date_accepted'
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
  if (contract.type === 'courier') {
    // Once accepted, the offer expiry no longer matters: delivery is owed by the real deadline.
    const deadline = courierDeliveryDeadlineMs(withAcceptedCourierInProgress(contract));
    if (deadline !== null) return deadline > now;
  }
  return expires === null || expires > now;
}

/** Collateral the Character posted by accepting a courier whose haul is still running. */
function postedCollateral(contract: StockContract, characterId: number, now: number): number {
  if (contract.type !== 'courier' || contract.for_corporation) return 0;
  if (contract.acceptor_id !== characterId || contract.issuer_id === characterId) return 0;
  const deadline = courierDeliveryDeadlineMs(withAcceptedCourierInProgress(contract));
  if (deadline === null || deadline <= now) return 0;
  return contract.collateral ?? 0;
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
    total += postedCollateral(contract, input.characterId, input.now);
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
