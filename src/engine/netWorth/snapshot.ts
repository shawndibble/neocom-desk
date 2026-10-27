/**
 * Net Worth Snapshot (issue #2865): one row per Character per UTC day, numbers
 * only. Pure — the fetching, the Dexie write and the once-a-day guard live in
 * `features/netWorth`.
 */
import { utcDay } from '../localDay';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { assetStackValue } from '@/engine/assetTree';
import { contractStockValue, type StockContract, type StockContractItem } from './contractStock';

export interface NetWorthSnapshotRow {
  /** `${characterId}:${day}` */
  id: string;
  characterId: number;
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  wallet: number;
  /** Assets priced at `hubId` on `day`, PLEX stacks removed. Never re-valued later. */
  assetValue: number;
  /** Legacy: hangar PLEX × the PLEX price, written by early snapshots. No longer written, shown or counted. */
  plexValue?: number;
  /** Escrow held by open buy orders. */
  escrow: number;
  /** Remaining sell-order stock, `volume_remain x price`. Absent on rows written before it existed (read as 0). */
  sellStock?: number;
  /** Items and courier rewards locked in the Character's own open contracts. Absent on rows written before it existed, or without the contracts permission. */
  contractStock?: number;
  hubId: string;
  /** Epoch ms of the write — the sync merge's last-write-wins key. */
  updatedAt: number;
}

/**
 * Whether a stored row predates a layer added since (an optional field, like
 * `sellStock`): today's row is then re-read once rather than left reading 0.
 * Add each new optional layer here. `contracts` is whether the Character holds
 * the contracts permission: without it the layer is absent for good, so a row
 * missing it is complete rather than old.
 */
export function lacksLayer(
  row: NetWorthSnapshotRow,
  { contracts = false }: { contracts?: boolean } = {}
): boolean {
  return row.sellStock === undefined || (contracts && row.contractStock === undefined);
}

export { utcDay };

export function snapshotId(characterId: number, day: string): string {
  return `${characterId}:${day}`;
}

export interface SnapshotAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_flag?: string;
  is_blueprint_copy?: boolean;
}

export interface SnapshotOrder {
  is_buy_order?: boolean;
  escrow?: number;
  price?: number;
  volume_remain?: number;
  is_corporation?: boolean;
}

export interface SnapshotInputs {
  characterId: number;
  now: number;
  hubId: string;
  /** `null` = the wallet could not be read (missing permission). */
  wallet: number | null;
  assets: readonly SnapshotAsset[] | null;
  orders: readonly SnapshotOrder[] | null;
  priceByTypeId: ReadonlyMap<number, number>;
  /** The Character's contracts and their items; `null` = not readable (no permission, or the read failed), which leaves the layer off the row. */
  contractStock?: {
    contracts: readonly StockContract[];
    itemsByContractId: ReadonlyMap<number, readonly StockContractItem[] | null>;
  } | null;
  /**
   * Items valued on their own rather than by type: an abyssal module at its
   * last known MutaMarket estimate. Such an item never takes a type price.
   */
  itemValueByItemId?: ReadonlyMap<number, number>;
}

/** The day's row, or `null` when any of wallet, assets or orders is unavailable — a partial total would read as a crash in net worth. */
export function buildSnapshotRow(input: SnapshotInputs): NetWorthSnapshotRow | null {
  const { wallet, assets, orders } = input;
  if (wallet === null || assets === null || orders === null) return null;
  let assetValue = 0;
  for (const asset of assets) {
    // PLEX is not counted: the PLEX Vault is not in ESI's assets, so only hangar PLEX would show.
    if (asset.type_id === PLEX_TYPE_ID) continue;
    assetValue += assetStackValue(asset, input.priceByTypeId, input.itemValueByItemId);
  }
  let escrow = 0;
  let sellStock = 0;
  for (const order of orders) {
    if (order.is_buy_order) escrow += order.escrow ?? 0;
    // A corp order is the corp's stock, not the Character's.
    else if (!order.is_corporation) sellStock += (order.volume_remain ?? 0) * (order.price ?? 0);
  }
  const day = utcDay(input.now);
  return {
    id: snapshotId(input.characterId, day),
    characterId: input.characterId,
    day,
    wallet,
    assetValue,
    escrow,
    sellStock,
    ...(input.contractStock
      ? {
          contractStock: contractStockValue({
            characterId: input.characterId,
            now: input.now,
            priceByTypeId: input.priceByTypeId,
            ...input.contractStock,
          }),
        }
      : {}),
    hubId: input.hubId,
    updatedAt: input.now,
  };
}

/** Days between the first and last with no row. Gaps stay gaps — nothing is interpolated. */
export function findMissingDays(days: readonly string[]): string[] {
  if (days.length === 0) return [];
  const have = new Set(days);
  const sorted = [...have].sort();
  const missing: string[] = [];
  const end = Date.parse(sorted[sorted.length - 1]!);
  for (let t = Date.parse(sorted[0]!) + 86_400_000; t < end; t += 86_400_000) {
    const day = utcDay(t);
    if (!have.has(day)) missing.push(day);
  }
  return missing;
}
