/**
 * Device-local: the fuel rate last measured for each structure, by structure
 * id, in blocks a day. The Structures page measures a rate only when EVE read
 * the fuel bay and the fuel expiry at the same time (`fuelPlan`); in between,
 * a refuel can make a fresh pair disagree, and this is the rate it falls back
 * to. A structure burns at one rate until its services change.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { isFiniteNumber, isPlainRecord } from '@/engine/guards';

export type FuelRates = Readonly<Record<string, number>>;

const NO_RATES: FuelRates = {};

export const useFuelRates = createLocalSetting<FuelRates>({
  key: 'corpStructuresFuelRates',
  defaultValue: NO_RATES,
  parse: (raw) =>
    isPlainRecord(raw)
      ? Object.fromEntries(
          Object.entries(raw).filter(
            (entry): entry is [string, number] => isFiniteNumber(entry[1]) && entry[1] > 0
          )
        )
      : null,
});

/** Close enough to the stored rate that rewriting it would only churn the setting. */
const SAME_RATE = 0.5;

/**
 * `rates` with each newly measured rate in, or `rates` itself when none moved
 * by `SAME_RATE` or more, so a caller can skip the write.
 */
export function withMeasuredRates(
  rates: FuelRates,
  measured: ReadonlyMap<number, number>
): FuelRates {
  const changed = [...measured].filter(
    ([id, perDay]) => rates[id] === undefined || Math.abs(rates[id] - perDay) >= SAME_RATE
  );
  return changed.length === 0 ? rates : { ...rates, ...Object.fromEntries(changed) };
}
