/**
 * Upwell structure fuel planning for the Structures page (issue #6093): how
 * many fuel blocks a structure burns a day and how many it needs to stay
 * fuelled until a date the pilot picks. Pure: assets and times in, block
 * counts out.
 *
 * ESI gives a structure's `fuel_expires` and, through the corporation's
 * assets, what sits in its fuel bay — never the burn rate. The rate is the
 * one those two imply: the blocks in the bay last exactly until expiry.
 * Working it out from the fitted service modules is out of scope (#6093).
 */
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { FUEL_BLOCK_TYPE_IDS } from './starbases';

/** Every fuel block type is 5 m³ (SDE group 1136). */
export const FUEL_BLOCK_VOLUME_M3 = 5;

/** The asset location flag of a structure's fuel bay. */
const FUEL_BAY_FLAG = 'StructureFuel';

/**
 * Further apart than this, the bay and the expiry are not one refresh's
 * reading: blocks may have been added or burned in between, so no rate.
 */
const SAME_REFRESH_MS = HOUR_MS;

/** Less fuel left than this and the rate is too coarse to trust. */
const MIN_RUNWAY_MS = HOUR_MS;

/** The asset fields the bay sum reads (an ESI corporation asset has them all). */
export interface FuelBayAsset {
  type_id: number;
  quantity: number;
  location_id: number;
  location_flag: string;
}

/**
 * Fuel blocks in each structure's fuel bay, by structure id: corporation
 * assets with the `StructureFuel` flag, at that structure, of a fuel block
 * type. A structure with none has no entry.
 */
export function fuelBays(assets: readonly FuelBayAsset[]): Map<number, number> {
  const bays = new Map<number, number>();
  for (const asset of assets) {
    if (asset.location_flag !== FUEL_BAY_FLAG || !FUEL_BLOCK_TYPE_IDS.has(asset.type_id)) continue;
    bays.set(asset.location_id, (bays.get(asset.location_id) ?? 0) + asset.quantity);
  }
  return bays;
}

/**
 * The moment a "fuel until" `YYYY-MM-DD` date means: the end of that EVE
 * (UTC) day, so the structure stays fuelled through all of it.
 */
export function fuelUntilMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d! + 1);
}

export interface FuelPlanInput {
  /** Blocks in the bay, or null when the bay could not be read. */
  blocks: number | null;
  /** When the bay was read. */
  bayReadAtMs: number;
  /** `fuel_expires`, or null for a structure already out of fuel. */
  fuelExpiresMs: number | null;
  /** When the expiry was read. */
  expiryReadAtMs: number;
  /** The moment the structure should stay fuelled until. */
  untilMs: number;
}

export interface FuelPlan {
  /** Blocks burned a day, or null when the inputs cannot give one. */
  perDay: number | null;
  /** Blocks to add to reach `untilMs`, rounded up; null when unknown. */
  needed: number | null;
}

export function fuelPlan(input: FuelPlanInput): FuelPlan {
  const { blocks, bayReadAtMs, fuelExpiresMs, expiryReadAtMs, untilMs } = input;
  const runwayMs = fuelExpiresMs === null ? 0 : fuelExpiresMs - bayReadAtMs;
  const rated =
    blocks !== null &&
    blocks > 0 &&
    runwayMs >= MIN_RUNWAY_MS &&
    Math.abs(bayReadAtMs - expiryReadAtMs) <= SAME_REFRESH_MS;
  const perDay = rated ? (blocks * DAY_MS) / runwayMs : null;
  if (fuelExpiresMs !== null && fuelExpiresMs >= untilMs) return { perDay, needed: 0 };
  if (!rated) return { perDay: null, needed: null };
  // Multiply before dividing so a whole answer stays whole; the epsilon keeps
  // a float's last-bit error from rounding 90.000…01 up to 91.
  const raw = (blocks * (untilMs - fuelExpiresMs!)) / runwayMs;
  return { perDay, needed: Math.ceil(raw - 1e-9) };
}
