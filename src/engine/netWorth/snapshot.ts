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
  /** Legacy: hangar PLEX × the PLEX price, written by early snapshots. No longer written, shown or counted. */
  plexValue?: number;
  /** Escrow held by open buy orders. */
  escrow: number;
  /** Remaining sell-order stock, `volume_remain x price`. Absent on rows written before it existed (read as 0). */
  sellStock?: number;
  hubId: string;
  /** Epoch ms of the write — the sync merge's last-write-wins key. */
  updatedAt: number;
}

/**
 * Whether a stored row predates a layer added since (an optional field, like
 * `sellStock`): today's row is then re-read once rather than left reading 0.
 * Add each new optional layer here.
 */
export function lacksLayer(row: NetWorthSnapshotRow): boolean {
  return row.sellStock === undefined;
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
}

/** The day's row, or `null` when any of wallet, assets or orders is unavailable — a partial total would read as a crash in net worth. */
export function buildSnapshotRow(input: SnapshotInputs): NetWorthSnapshotRow | null {
  const { wallet, assets, orders } = input;
  if (wallet === null || assets === null || orders === null) return null;
  let assetValue = 0;
  for (const asset of assets) {
    // PLEX is not counted: the PLEX Vault is not in ESI's assets, so only hangar PLEX would show.
    if (asset.type_id === PLEX_TYPE_ID) continue;
    // A blueprint copy has no market price; the Assets page values it separately.
    if (asset.is_blueprint_copy) continue;
    assetValue += asset.quantity * (input.priceByTypeId.get(asset.type_id) ?? 0);
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
