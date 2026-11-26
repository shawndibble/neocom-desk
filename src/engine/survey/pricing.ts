import type { SurveyScan } from './series';

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
