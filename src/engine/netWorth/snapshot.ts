/**
 * Net Worth Snapshot (issue #2865): one row per Character per UTC day, numbers
 * only. Pure — the fetching, the Dexie write and the once-a-day guard live in
 * `features/netWorth`.
 */
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';

export interface NetWorthSnapshotRow {
  /** `${characterId}:${day}` */
  id: string;
  characterId: number;
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  wallet: number;
  /** Assets priced at `hubId` on `day`, PLEX stacks removed. Never re-valued later. */
  assetValue: number;
  /** Hangar PLEX × the global PLEX price. */
  plexValue: number;
  /** Escrow held by open buy orders. */
  escrow: number;
  hubId: string;
  /** Epoch ms of the write — the sync merge's last-write-wins key. */
  updatedAt: number;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

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
  plexPrice: number | null;
}

/** The day's row, or `null` when any of wallet, assets or orders is unavailable — a partial total would read as a crash in net worth. */
export function buildSnapshotRow(input: SnapshotInputs): NetWorthSnapshotRow | null {
  const { wallet, assets, orders } = input;
  if (wallet === null || assets === null || orders === null) return null;
  let assetValue = 0;
  let plexQuantity = 0;
  for (const asset of assets) {
    if (asset.type_id === PLEX_TYPE_ID) {
      // PLEX in a hangar is the Character's own; anything else is not counted anywhere.
      if (asset.location_flag === 'Hangar') plexQuantity += asset.quantity;
      continue;
    }
    // A blueprint copy has no market price; the Assets page values it separately.
    if (asset.is_blueprint_copy) continue;
    assetValue += asset.quantity * (input.priceByTypeId.get(asset.type_id) ?? 0);
  }
  let escrow = 0;
  for (const order of orders) if (order.is_buy_order) escrow += order.escrow ?? 0;
  const day = utcDay(input.now);
  return {
    id: snapshotId(input.characterId, day),
    characterId: input.characterId,
    day,
    wallet,
    assetValue,
    plexValue: plexQuantity * (input.plexPrice ?? 0),
    escrow,
    hubId: input.hubId,
    updatedAt: input.now,
  };
}

/** Union by id; the later `updatedAt` wins a collision (same Character, same day on two devices). */
export function mergeSnapshotRows(
  local: readonly NetWorthSnapshotRow[],
  remote: readonly NetWorthSnapshotRow[]
): NetWorthSnapshotRow[] {
  const byId = new Map<string, NetWorthSnapshotRow>();
  for (const row of [...local, ...remote]) {
    const held = byId.get(row.id);
    if (!held || row.updatedAt > held.updatedAt) byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => a.characterId - b.characterId || a.day.localeCompare(b.day)
  );
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
