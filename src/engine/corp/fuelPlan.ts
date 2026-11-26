import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import { shiftUtcDate } from '../localDay';
import { FUEL_BLOCK_TYPE_IDS } from './starbases';

export const FUEL_BLOCK_VOLUME_M3 = 5;

const FUEL_BAY_FLAG = 'StructureFuel';

const SAME_READ_MS = 5 * MINUTE_MS;

const MIN_RUNWAY_MS = HOUR_MS;

export interface FuelBayAsset {
  type_id: number;
  quantity: number;
  location_id: number;
  location_flag: string;
}

export function fuelBays(assets: readonly FuelBayAsset[]): Map<number, number> {
  const bays = new Map<number, number>();
  for (const asset of assets) {
    if (asset.location_flag !== FUEL_BAY_FLAG || !FUEL_BLOCK_TYPE_IDS.has(asset.type_id)) continue;
    bays.set(asset.location_id, (bays.get(asset.location_id) ?? 0) + asset.quantity);
  }
  return bays;
}

export function fuelUntilMs(date: string): number {
  return Date.parse(shiftUtcDate(date, 1));
}

export interface FuelPlanInput {
  blocks: number | null;
  bayReadAtMs: number | null;
  fuelExpiresMs: number | null;
  expiryReadAtMs: number | null;
  untilMs: number;
  knownPerDay?: number | null;
}

export type FuelRateSource = 'measured' | 'remembered' | 'estimated';

export interface FuelPlan {
  perDay: number | null;
  needed: number | null;
  rateSource: FuelRateSource | null;
  ratePending: boolean;
}

export function fuelPlan(input: FuelPlanInput): FuelPlan {
  const { blocks, bayReadAtMs, fuelExpiresMs, expiryReadAtMs, untilMs, knownPerDay } = input;
  const runwayMs =
    fuelExpiresMs === null || bayReadAtMs === null ? null : fuelExpiresMs - bayReadAtMs;
  const reading =
    blocks !== null && blocks > 0 && runwayMs !== null && runwayMs >= MIN_RUNWAY_MS
      ? { blocks, runwayMs }
      : null;
  const bayLeadMs =
    bayReadAtMs === null || expiryReadAtMs === null ? null : bayReadAtMs - expiryReadAtMs;
  const sameRead = bayLeadMs !== null && Math.abs(bayLeadMs) <= SAME_READ_MS;
  const bayBehind = bayLeadMs === null || bayLeadMs < -SAME_READ_MS;
  const remembered =
    bayBehind && blocks !== null && fuelExpiresMs !== null && knownPerDay != null && knownPerDay > 0
      ? knownPerDay
      : null;
  const rateSource: FuelRateSource | null =
    reading && sameRead
      ? 'measured'
      : reading && !bayBehind
        ? 'estimated'
        : remembered !== null
          ? 'remembered'
          : null;
  const ratePending =
    rateSource === null &&
    bayBehind &&
    blocks !== null &&
    fuelExpiresMs !== null &&
    (runwayMs === null || runwayMs >= MIN_RUNWAY_MS);
  const rated = rateSource === 'measured' || rateSource === 'estimated' ? reading : null;
  const perDay = rated ? (rated.blocks * DAY_MS) / rated.runwayMs : remembered;
  if (fuelExpiresMs !== null && fuelExpiresMs >= untilMs) {
    return { perDay, needed: 0, rateSource, ratePending: false };
  }
  if (perDay === null || fuelExpiresMs === null) {
    return { perDay, needed: null, rateSource, ratePending };
  }
  const raw = rated
    ? (rated.blocks * (untilMs - fuelExpiresMs)) / rated.runwayMs
    : (perDay * (untilMs - fuelExpiresMs)) / DAY_MS;
  return { perDay, needed: Math.ceil(raw - 1e-9), rateSource, ratePending };
}

export interface StarbaseFuelPlanInput {
  perDay: number | null;
  fuelExpiresMs: number | null;
  untilMs: number;
}

export function starbaseFuelPlan(input: StarbaseFuelPlanInput): FuelPlan {
  const { perDay, fuelExpiresMs, untilMs } = input;
  const known = perDay !== null && fuelExpiresMs !== null;
  const needed = known
    ? Math.max(0, Math.ceil((perDay * (untilMs - fuelExpiresMs)) / DAY_MS - 1e-9))
    : null;
  return { perDay, needed, rateSource: null, ratePending: false };
}
