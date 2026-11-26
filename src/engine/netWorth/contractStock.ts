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
  is_included: boolean;
  raw_quantity?: number;
}

function runningDeadline(contract: StockContract): number | null {
  return courierDeliveryDeadlineMs(withAcceptedCourierInProgress(contract));
}

export function isOpenOwnContract(
  contract: StockContract,
  characterId: number,
  now: number
): boolean {
  if (contract.issuer_id !== characterId || contract.for_corporation) return false;
  if (!isActiveContractStatus(contract.status)) return false;
  const expires = parseInstant(contract.date_expired);
  if (contract.type === 'courier') {
    const deadline = runningDeadline(contract);
    if (deadline !== null) return deadline > now;
  }
  return expires === null || expires > now;
}

function postedCollateral(contract: StockContract, characterId: number, now: number): number {
  if (contract.type !== 'courier' || contract.for_corporation) return 0;
  if (contract.acceptor_id !== characterId || contract.issuer_id === characterId) return 0;
  const deadline = runningDeadline(contract);
  if (deadline === null || deadline <= now) return 0;
  return contract.collateral ?? 0;
}

function isItemContract(contract: StockContract): boolean {
  return contract.type === 'item_exchange' || contract.type === 'auction';
}

export function openIssuedItemContracts(
  contracts: readonly StockContract[],
  characterId: number,
  now: number
): StockContract[] {
  return contracts.filter((c) => isItemContract(c) && isOpenOwnContract(c, characterId, now));
}

function itemsValue(
  items: readonly StockContractItem[],
  priceByTypeId: ReadonlyMap<number, number>
): number | null {
  let total = 0;
  for (const line of items) {
    if (!line.is_included) continue;
    const price = priceByTypeId.get(line.type_id);
    if (price === undefined || line.raw_quantity === -2) return null;
    total += line.quantity * price;
  }
  return total;
}

export function contractStockValue(input: {
  characterId: number;
  now: number;
  contracts: readonly StockContract[];
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
