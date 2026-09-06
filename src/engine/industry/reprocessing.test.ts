import { describe, it, expect } from 'vitest';
import {
  reprocessingEfficiency,
  reprocessingYield,
  reprocessingValue,
  BASE_STATION_REPROCESSING_RATE,
} from './reprocessing';

/** Tritanium, Pyerite — the two the fixtures below refine into. */
const TRITANIUM = 34;
const PYERITE = 35;

/** One portion of 10 units yields 1,000 Tritanium and 200 Pyerite. */
const YIELD = {
  portionSize: 10,
  materials: [
    { typeId: TRITANIUM, quantity: 1000 },
    { typeId: PYERITE, quantity: 200 },
  ],
};

describe('reprocessingEfficiency', () => {
  it('is the bare station rate with no skills trained', () => {
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 0,
        reprocessingEfficiencyLevel: 0,
        specialisationLevel: 0,
      })
    ).toBeCloseTo(0.5, 10);
  });

  it('multiplies the three skill bonuses onto the station rate', () => {
    // 0.5 x 1.15 x 1.10 x 1.10
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 5,
        reprocessingEfficiencyLevel: 5,
        specialisationLevel: 5,
      })
    ).toBeCloseTo(0.5 * 1.15 * 1.1 * 1.1, 10);
  });

  it("takes the station rate as an input, since a structure's own rate is not 50%", () => {
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 0,
        reprocessingEfficiencyLevel: 0,
        specialisationLevel: 0,
        stationRate: 0.54,
      })
    ).toBeCloseTo(0.54, 10);
  });

  it('exports the assumed station rate rather than hiding it in the maths', () => {
    expect(BASE_STATION_REPROCESSING_RATE).toBe(0.5);
  });
});

describe('reprocessingYield', () => {
  it('refines whole portions only, and reports the units it could not', () => {
    const result = reprocessingYield({ ...YIELD, units: 23, efficiency: 1 });
    expect(result.batches).toBe(2);
    expect(result.unitsRefined).toBe(20);
    expect(result.unitsLeftOver).toBe(3);
  });

  it('yields nothing at all when there is not one whole portion', () => {
    const result = reprocessingYield({ ...YIELD, units: 9, efficiency: 1 });
    expect(result.batches).toBe(0);
    expect(result.outputs).toEqual([]);
    expect(result.unitsLeftOver).toBe(9);
  });

  it('scales each material by the batches and the efficiency, flooring per material', () => {
    const result = reprocessingYield({ ...YIELD, units: 20, efficiency: 0.5 });
    expect(result.outputs).toEqual([
      { typeId: TRITANIUM, quantity: 1000 },
      { typeId: PYERITE, quantity: 200 },
    ]);
  });

  it('floors a fractional material rather than rounding it up', () => {
    // 1 batch x 200 x 0.507 = 101.4 -> 101
    const result = reprocessingYield({ ...YIELD, units: 10, efficiency: 0.507 });
    expect(result.outputs).toContainEqual({ typeId: PYERITE, quantity: 101 });
  });

  it('drops a material that floors to zero rather than listing an empty line', () => {
    const result = reprocessingYield({
      portionSize: 1,
      materials: [{ typeId: PYERITE, quantity: 1 }],
      units: 1,
      efficiency: 0.5,
    });
    expect(result.outputs).toEqual([]);
  });

  it('has nothing to refine when the type has no materials at all', () => {
    const result = reprocessingYield({
      portionSize: 1,
      materials: [],
      units: 100,
      efficiency: 1,
    });
    expect(result.outputs).toEqual([]);
    expect(result.batches).toBe(100);
  });

  it('treats a non-positive portion size as unrefinable rather than dividing by zero', () => {
    const result = reprocessingYield({ ...YIELD, portionSize: 0, units: 10, efficiency: 1 });
    expect(result.batches).toBe(0);
    expect(result.unitsLeftOver).toBe(10);
  });
});

describe('reprocessingValue', () => {
  it('sums each material against its price', () => {
    const value = reprocessingValue(
      [
        { typeId: TRITANIUM, quantity: 1000 },
        { typeId: PYERITE, quantity: 200 },
      ],
      { [TRITANIUM]: 5, [PYERITE]: 10 }
    );
    expect(value.total).toBe(1000 * 5 + 200 * 10);
    expect(value.pricedAll).toBe(true);
    expect(value.unpricedTypeIds).toEqual([]);
  });

  it('says the total is partial rather than counting an unpriced material as free', () => {
    const value = reprocessingValue(
      [
        { typeId: TRITANIUM, quantity: 1000 },
        { typeId: PYERITE, quantity: 200 },
      ],
      { [TRITANIUM]: 5 }
    );
    expect(value.total).toBe(5000);
    expect(value.pricedAll).toBe(false);
    expect(value.unpricedTypeIds).toEqual([PYERITE]);
  });

  it('is worth nothing, and fully priced, when there is nothing to sell', () => {
    expect(reprocessingValue([], {})).toEqual({
      total: 0,
      pricedAll: true,
      unpricedTypeIds: [],
    });
  });
});
