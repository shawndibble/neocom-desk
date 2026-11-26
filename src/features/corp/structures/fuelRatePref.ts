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

const SAME_RATE = 0.5;

export function withMeasuredRates(
  rates: FuelRates,
  measured: ReadonlyMap<number, number>
): FuelRates {
  const changed = [...measured].filter(
    ([id, perDay]) => rates[id] === undefined || Math.abs(rates[id] - perDay) >= SAME_RATE
  );
  return changed.length === 0 ? rates : { ...rates, ...Object.fromEntries(changed) };
}
