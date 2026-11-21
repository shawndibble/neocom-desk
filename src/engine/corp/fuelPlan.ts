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
 *
 * The two come from separate ESI routes, each of which EVE updates on its own
 * hourly clock, so a refuel can land between them. Read the bay before the
 * refuel and the expiry after, and the rate comes out far too low — and so
 * does the fuel to haul. So a rate is *measured* only from a pair EVE read at
 * the same time; otherwise the last measured rate is used (a structure burns
 * at one rate until its services change), and failing that, a pair whose bay
 * is the newer read still gives an estimate, because a refuel between the
 * two can only make that one too high, never too low.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { shiftUtcDate } from '../localDay';
import { FUEL_BLOCK_TYPE_IDS } from './starbases';

/** Every fuel block type is 5 m³ (SDE group 1136). */
export const FUEL_BLOCK_VOLUME_M3 = 5;

/** The asset location flag of a structure's fuel bay. */
const FUEL_BAY_FLAG = 'StructureFuel';

/**
 * EVE read the bay and the expiry at the same time when their reads are this
 * close: one refresh asks for both, seconds apart.
 */
const SAME_READ_MS = 5 * MINUTE_MS;

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
  // A bare `YYYY-MM-DD` parses as UTC midnight.
  return Date.parse(shiftUtcDate(date, 1));
}

export interface FuelPlanInput {
  /** Blocks in the bay, or null when the bay could not be read. */
  blocks: number | null;
  /** When EVE read the bay, or null when unknown. */
  bayAsOfMs: number | null;
  /** `fuel_expires`, or null for a structure already out of fuel. */
  fuelExpiresMs: number | null;
  /** When EVE read the expiry, or null when unknown. */
  expiryAsOfMs: number | null;
  /** The moment the structure should stay fuelled until. */
  untilMs: number;
  /** The rate last measured for this structure (`rateSource: 'measured'`), if any. */
  knownPerDay?: number | null;
}

/**
 * Where a plan's rate came from: a same-time pair (worth remembering), the
 * remembered rate, or a pair whose bay is the newer read.
 */
export type FuelRateSource = 'measured' | 'remembered' | 'estimated';

export interface FuelPlan {
  /** Blocks burned a day, or null when the inputs cannot give one. */
  perDay: number | null;
  /** Blocks to add to reach `untilMs`, rounded up; null when unknown. */
  needed: number | null;
  rateSource: FuelRateSource | null;
  /** The bay has fuel but is an older read than the expiry: the rate waits for EVE. */
  ratePending: boolean;
}

export function fuelPlan(input: FuelPlanInput): FuelPlan {
  const { blocks, bayAsOfMs, fuelExpiresMs, expiryAsOfMs, untilMs, knownPerDay } = input;
  const runwayMs = fuelExpiresMs === null || bayAsOfMs === null ? null : fuelExpiresMs - bayAsOfMs;
  const readable = blocks !== null && blocks > 0 && runwayMs !== null && runwayMs >= MIN_RUNWAY_MS;
  const bayLeadMs = bayAsOfMs === null || expiryAsOfMs === null ? null : bayAsOfMs - expiryAsOfMs;
  const remembered = knownPerDay != null && knownPerDay > 0 ? knownPerDay : null;
  const rateSource: FuelRateSource | null =
    readable && bayLeadMs !== null && Math.abs(bayLeadMs) <= SAME_READ_MS
      ? 'measured'
      : remembered !== null
        ? 'remembered'
        : readable && bayLeadMs !== null && bayLeadMs > 0
          ? 'estimated'
          : null;
  // A runway under the minimum has no rate to wait for; an unknown read time will have one.
  const ratePending =
    rateSource === null &&
    blocks !== null &&
    blocks > 0 &&
    fuelExpiresMs !== null &&
    (runwayMs === null || runwayMs >= MIN_RUNWAY_MS);
  const perDay =
    rateSource === null
      ? null
      : rateSource === 'remembered'
        ? remembered
        : (blocks! * DAY_MS) / runwayMs!;
  if (fuelExpiresMs !== null && fuelExpiresMs >= untilMs) {
    return { perDay, needed: 0, rateSource, ratePending: false };
  }
  if (perDay === null || fuelExpiresMs === null) {
    return { perDay, needed: null, rateSource, ratePending };
  }
  // Multiply before dividing so a whole answer stays whole; the epsilon keeps
  // a float's last-bit error from rounding 90.000…01 up to 91.
  const raw =
    rateSource === 'remembered'
      ? (perDay * (untilMs - fuelExpiresMs)) / DAY_MS
      : (blocks! * (untilMs - fuelExpiresMs)) / runwayMs!;
  return { perDay, needed: Math.ceil(raw - 1e-9), rateSource, ratePending };
}
