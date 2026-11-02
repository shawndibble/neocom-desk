/**
 * The pilot's Refining Setup: the facility they refine at, as two numbers.
 *
 * - **Facility yield** — the facility's own yield before skills and implants
 *   (an NPC station's 50%, or a structure's rate the pilot reads off its info).
 *   `reprocessingEfficiency` multiplies the pilot's skills on top; this is
 *   never their final yield.
 * - **Reprocessing tax** — the facility's fee, paid in ISK on the value of
 *   what comes out. It never shaves quantities, so the output list keeps the
 *   full yield.
 *
 * Pure: the stored values arrive as inputs. 0 for the yield means "unset".
 */
import { BASE_STATION_REPROCESSING_RATE } from './reprocessing';

export interface RefiningSetup {
  /** Fraction, 0.5 = 50%. */
  stationRate: number;
  /** Fraction of the refined value, 0.01 = 1%. */
  taxRate: number;
}

export const DEFAULT_REFINING_SETUP: RefiningSetup = {
  stationRate: BASE_STATION_REPROCESSING_RATE,
  taxRate: 0,
};

/** The stored fractions, tolerant of whatever another device or build wrote. */
export function resolveRefiningSetup(input: { yieldRate: number; taxRate: number }): RefiningSetup {
  const stationRate =
    Number.isFinite(input.yieldRate) && input.yieldRate > 0
      ? input.yieldRate
      : BASE_STATION_REPROCESSING_RATE;
  const taxRate = Number.isFinite(input.taxRate) ? Math.min(1, Math.max(0, input.taxRate)) : 0;
  return { stationRate, taxRate };
}

/**
 * The facility's base yield behind a total yield: the figure the EVE client's
 * Reprocessing window shows (`69.7%`), which already has the pilot's skills
 * and implants in it, divided back down by `skillsMultiplier`. Rounded to four
 * places, so a typed total reads back as itself. Null where there is no
 * multiplier to divide by.
 */
export function facilityBaseYieldFor(totalYield: number, skillsMultiplier: number): number | null {
  if (!(skillsMultiplier > 0) || !Number.isFinite(totalYield)) return null;
  return Math.round((totalYield / skillsMultiplier) * 10_000) / 10_000;
}

/**
 * The fee on a pile of refined minerals, `quantities` by type id at `prices`.
 * A mineral with no price adds nothing: the fee is on what the facility could value.
 */
export function reprocessingTaxOn(
  quantities: Readonly<Record<number, number>>,
  prices: Readonly<Record<number, number>>,
  taxRate: number
): number {
  let value = 0;
  for (const [typeId, quantity] of Object.entries(quantities)) {
    value += quantity * (prices[Number(typeId)] ?? 0);
  }
  return value * taxRate;
}

/** What a refined value comes to once the facility's fee is paid. */
export function netOfReprocessingTax(value: number, taxRate: number): number {
  return value * (1 - taxRate);
}
