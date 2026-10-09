/**
 * Puts a market value on a Survey's rocks. The scanner's own ISK column is
 * not always right, so it is dropped: a rock is worth its ore units times
 * the ore's market price per unit (the caller picks the market and the form,
 * Compressed buy at the pilot's hub). An ore with no price, or a rock with no
 * unit count, has no value rather than a wrong one. Pure.
 */
import type { SurveyScan } from './series';

/** `unitPrice` maps the ore name as the scanner printed it to ISK per unit. */
export function priceScans(
  scans: readonly SurveyScan[],
  unitPrice: ReadonlyMap<string, number>
): SurveyScan[] {
  return scans.map((scan) => ({
    ...scan,
    rocks: scan.rocks.map((rock) => {
      const { isk, ...unvalued } = rock;
      void isk;
      const price = unitPrice.get(rock.ore);
      return rock.units !== undefined && price !== undefined && price > 0
        ? { ...unvalued, isk: rock.units * price }
        : unvalued;
    }),
  }));
}
