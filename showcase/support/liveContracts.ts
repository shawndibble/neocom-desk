/**
 * Public-contract snapshot rows built from REAL contracts.
 *
 * `showcase/tools/fetch-live-snapshot.mjs` pulls a page of The Forge's public
 * contracts off ESI along with each one's item lines; this reshapes them into
 * the row types the two panels read
 * (`engine/contracts/contractOffers.ts`, `engine/contracts/bpcSearch.ts`).
 * Real contract ids, real prices, real items — the alternative was inventing
 * a market, which is exactly what a showcase should not do.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface RawContract {
  contract_id: number;
  price: number;
  buyout?: number;
  type: string;
  date_expired: string;
  start_location_id: number;
  end_location_id?: number;
  reward?: number;
  collateral?: number;
  volume?: number;
  days_to_complete?: number;
}

interface RawItem {
  record_id: number;
  type_id: number;
  quantity: number;
  is_included: boolean;
  is_blueprint_copy?: boolean;
  material_efficiency?: number;
  time_efficiency?: number;
  runs?: number;
}

interface LiveSnapshot {
  regionId: number;
  fetchedAt: number;
  itemExchange: { contract: RawContract; items: RawItem[] }[];
  courier: RawContract[];
}

function live<T>(name: string): T {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`../live/${name}`, import.meta.url)), 'utf-8')
  ) as T;
}

const SNAPSHOT = live<LiveSnapshot>('public-contracts.json');

/** Only types the SDE catalogue names — anything else renders as a bare id. */
const NAMED_TYPE_IDS: ReadonlySet<number> = new Set(
  live<{ typeId: number }[]>('../../public/data/market/types.json').map((entry) => entry.typeId)
);

export interface PublicContractOfferRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  quantity: number;
  isBlueprintCopy?: true;
  me?: number;
  te?: number;
  runs?: number;
  dateExpired: number;
}

export interface BpcContractRow {
  contractId: number;
  regionId: number;
  locationId: number;
  typeId: number;
  price: number;
  buyout?: number;
  isAuction: boolean;
  me: number;
  te: number;
  runs: number;
  quantity: number;
  dateExpired: number;
}

/**
 * `dateExpired` is shifted forward so a snapshot taken today still reads as a
 * live market weeks from now — an all-expired table is not a screenshot.
 */
function expiryMs(contract: RawContract, index: number): number {
  return Date.now() + (2 + (index % 20)) * 86_400_000;
}

/**
 * One row per (contract, item line), which is the shape the backend writes.
 * Single-line contracts are preferred so a row's price is unambiguously the
 * price of the thing named in it.
 */
export function offerRows(): PublicContractOfferRow[] {
  const rows: PublicContractOfferRow[] = [];
  SNAPSHOT.itemExchange.forEach(({ contract, items }, index) => {
    const included = items.filter((item) => item.is_included);
    if (included.length !== 1 || contract.price <= 0) return;
    const [item] = included;
    if (!NAMED_TYPE_IDS.has(item.type_id)) return;
    rows.push({
      contractId: contract.contract_id,
      regionId: SNAPSHOT.regionId,
      locationId: contract.start_location_id,
      typeId: item.type_id,
      price: contract.price,
      isAuction: contract.type === 'auction',
      quantity: item.quantity,
      ...(item.is_blueprint_copy
        ? {
            isBlueprintCopy: true as const,
            me: item.material_efficiency ?? 0,
            te: item.time_efficiency ?? 0,
            runs: item.runs ?? 1,
          }
        : {}),
      dateExpired: expiryMs(contract, index),
    });
  });
  return rows;
}

/** BPC Search reads its own pre-narrowed snapshot, so the copies are split out here. */
export function bpcRows(): BpcContractRow[] {
  const rows: BpcContractRow[] = [];
  SNAPSHOT.itemExchange.forEach(({ contract, items }, index) => {
    if (contract.price <= 0) return;
    for (const item of items) {
      if (!item.is_included || !item.is_blueprint_copy) continue;
      if (!NAMED_TYPE_IDS.has(item.type_id)) continue;
      rows.push({
        contractId: contract.contract_id,
        regionId: SNAPSHOT.regionId,
        locationId: contract.start_location_id,
        typeId: item.type_id,
        price: contract.price,
        isAuction: contract.type === 'auction',
        me: item.material_efficiency ?? 0,
        te: item.time_efficiency ?? 0,
        runs: item.runs ?? 1,
        quantity: item.quantity,
        dateExpired: expiryMs(contract, index),
      });
    }
  });
  return rows;
}
