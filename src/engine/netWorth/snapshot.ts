import { utcDay } from '../localDay';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { assetStackValue } from '@/engine/assetTree';
import { contractStockValue, type StockContract, type StockContractItem } from './contractStock';
import { DAY_MS } from '@/lib/age';

export interface NetWorthSnapshotRow {
  id: string;
  characterId: number;
  day: string;
  wallet: number;
  assetValue: number;
  plexValue?: number;
  escrow: number;
  sellStock?: number;
  contractStock?: number;
  hubId: string;
  updatedAt: number;
}

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
  wallet: number | null;
  assets: readonly SnapshotAsset[] | null;
  orders: readonly SnapshotOrder[] | null;
  priceByTypeId: ReadonlyMap<number, number>;
  contractStock?: {
    contracts: readonly StockContract[];
    itemsByContractId: ReadonlyMap<number, readonly StockContractItem[] | null>;
  } | null;
  itemValueByItemId?: ReadonlyMap<number, number>;
}

export function buildSnapshotRow(input: SnapshotInputs): NetWorthSnapshotRow | null {
  const { wallet, assets, orders } = input;
  if (wallet === null || assets === null || orders === null) return null;
  let assetValue = 0;
  for (const asset of assets) {
    if (asset.type_id === PLEX_TYPE_ID) continue;
    assetValue += assetStackValue(asset, input.priceByTypeId, input.itemValueByItemId);
  }
  let escrow = 0;
  let sellStock = 0;
  for (const order of orders) {
    if (order.is_buy_order) escrow += order.escrow ?? 0;
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

export function findMissingDays(days: readonly string[]): string[] {
  if (days.length === 0) return [];
  const have = new Set(days);
  const sorted = [...have].sort();
  const missing: string[] = [];
  const end = Date.parse(sorted[sorted.length - 1]!);
  for (let t = Date.parse(sorted[0]!) + DAY_MS; t < end; t += DAY_MS) {
    const day = utcDay(t);
    if (!have.has(day)) missing.push(day);
  }
  return missing;
}
