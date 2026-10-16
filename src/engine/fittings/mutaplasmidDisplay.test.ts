import { describe, expect, it } from 'vitest';
import type { MutaplasmidData } from '@/sde/types';
import { mutaplasmidLookup } from './mutaplasmids';
import { DOGMA_UNIT } from './attributeUnits';
import {
  defaultBaseTypeId,
  displayRollRange,
  multiplierPercentRows,
  mutaplasmidsMaking,
  rolledAttributeRows,
  strainRangeRows,
} from './mutaplasmidDisplay';

// Shapes and ranges from public/data/mutaplasmids.json; values trimmed.
const GRAVID_HEAVY_NEUT = 47831;
const DECAYED_HEAVY_NEUT = 47829;
const HEAVY_ABYSSAL_NEUT = 47832;
const HEAVY_GREMLIN_NEUT = 16475;
const HEAVY_NEUT_II = 12271;
const GRAVID_DC = 52227;
const ABYSSAL_DC = 52230;
const DC_II = 2048;

const DATA: MutaplasmidData = {
  attributeNames: { 6: 'capacitorNeed', 54: 'maxRange', 73: 'duration', 974: 'hullEm' },
  mutaplasmids: {
    [GRAVID_HEAVY_NEUT]: {
      result: HEAVY_ABYSSAL_NEUT,
      bases: [HEAVY_NEUT_II, HEAVY_GREMLIN_NEUT],
      attributes: [
        { id: 6, min: 0.8, max: 1.3, highIsGood: false },
        { id: 54, min: 0.8, max: 1.3, highIsGood: true },
      ],
    },
    [DECAYED_HEAVY_NEUT]: {
      result: HEAVY_ABYSSAL_NEUT,
      bases: [HEAVY_GREMLIN_NEUT],
      attributes: [
        { id: 6, min: 0.85, max: 1.2, highIsGood: false },
        { id: 73, min: 0.9, max: 1.1, highIsGood: false },
      ],
    },
    [GRAVID_DC]: {
      result: ABYSSAL_DC,
      bases: [DC_II],
      attributes: [{ id: 974, min: 0.9, max: 1.1, highIsGood: false }],
    },
  },
  abyssalTypeIds: [HEAVY_ABYSSAL_NEUT, ABYSSAL_DC],
};
const lookup = mutaplasmidLookup(DATA);

const UNITS: Record<number, number> = {
  73: DOGMA_UNIT.milliseconds,
  974: DOGMA_UNIT.inverseAbsolutePercent,
};
const unitIdOf = (id: number) => UNITS[id];

describe('displayRollRange', () => {
  it('keeps a plain unit as it is', () => {
    expect(displayRollRange({ min: 80, max: 130, highIsGood: false })).toEqual({
      low: 80,
      high: 130,
      highIsGood: false,
    });
  });

  it('converts milliseconds to seconds', () => {
    expect(
      displayRollRange({ min: 9000, max: 11000, highIsGood: false }, DOGMA_UNIT.milliseconds)
    ).toEqual({ low: 9, high: 11, highIsGood: false });
  });

  it('re-orders and flips the direction of a resonance shown as a resistance', () => {
    // Resonance 0.54..0.66 (lower is better) is a 34%..46% resistance (higher is better).
    const shown = displayRollRange(
      { min: 0.54, max: 0.66, highIsGood: false },
      DOGMA_UNIT.inverseAbsolutePercent
    );
    expect(shown.low).toBeCloseTo(34);
    expect(shown.high).toBeCloseTo(46);
    expect(shown.highIsGood).toBe(true);
  });
});

describe('mutaplasmidsMaking', () => {
  it('lists only the mutaplasmids that make the type out of that base, by type id', () => {
    expect(
      mutaplasmidsMaking(lookup, HEAVY_ABYSSAL_NEUT, HEAVY_GREMLIN_NEUT).map((m) => m.typeId)
    ).toEqual([DECAYED_HEAVY_NEUT, GRAVID_HEAVY_NEUT]);
    expect(
      mutaplasmidsMaking(lookup, HEAVY_ABYSSAL_NEUT, HEAVY_NEUT_II).map((m) => m.typeId)
    ).toEqual([GRAVID_HEAVY_NEUT]);
    expect(mutaplasmidsMaking(lookup, HEAVY_ABYSSAL_NEUT, DC_II)).toEqual([]);
  });
});

describe('strainRangeRows', () => {
  const base = new Map([
    [6, 100],
    [54, 10000],
    [73, 10000],
  ]);

  it('gives one row per rolled attribute, one absolute range per mutaplasmid', () => {
    const rows = strainRangeRows(lookup, [DECAYED_HEAVY_NEUT, GRAVID_HEAVY_NEUT], base, unitIdOf);
    expect(rows.map((r) => r.attributeId)).toEqual([6, 54, 73]);
    const cap = rows[0]!;
    expect(cap.base).toBe(100);
    expect(cap.highIsGood).toBe(false);
    expect(cap.ranges[0]).toEqual({ low: 85, high: 120, highIsGood: false });
    expect(cap.ranges[1]).toEqual({ low: 80, high: 130, highIsGood: false });
    // Decayed doesn't roll optimal range; Gravid doesn't roll duration.
    expect(rows[1]!.ranges[0]).toBeNull();
    expect(rows[2]!.ranges[1]).toBeNull();
  });

  it('shows the base and ranges in the unit the game shows', () => {
    const [duration] = strainRangeRows(
      lookup,
      [DECAYED_HEAVY_NEUT],
      new Map([[73, 10000]]),
      unitIdOf
    ).filter((r) => r.attributeId === 73);
    expect(duration!.base).toBe(10);
    expect(duration!.ranges[0]).toEqual({ low: 9, high: 11, highIsGood: false });
  });

  it('leaves out an attribute the base carries no value for', () => {
    const rows = strainRangeRows(lookup, [GRAVID_HEAVY_NEUT], new Map([[6, 100]]), unitIdOf);
    expect(rows.map((r) => r.attributeId)).toEqual([6]);
  });

  it('takes the shown direction of a resonance row', () => {
    const [row] = strainRangeRows(lookup, [GRAVID_DC], new Map([[974, 0.6]]), unitIdOf);
    expect(row!.base).toBeCloseTo(40);
    expect(row!.highIsGood).toBe(true);
  });
});

describe('multiplierPercentRows', () => {
  it('states each roll as a signed percentage of the base value', () => {
    expect(multiplierPercentRows(lookup.mutaplasmid(GRAVID_HEAVY_NEUT)!, unitIdOf)).toEqual([
      {
        attributeId: 6,
        lowPct: expect.closeTo(-20),
        highPct: expect.closeTo(30),
        highIsGood: false,
        shownBackwards: false,
      },
      {
        attributeId: 54,
        lowPct: expect.closeTo(-20),
        highPct: expect.closeTo(30),
        highIsGood: true,
        shownBackwards: false,
      },
    ]);
  });

  it('keeps a resonance roll as the raw multiplier and flags that it is shown backwards', () => {
    // ×0.9 on a resonance is a higher resistance, by an amount that depends on the base.
    expect(multiplierPercentRows(lookup.mutaplasmid(GRAVID_DC)!, unitIdOf)).toEqual([
      {
        attributeId: 974,
        lowPct: expect.closeTo(-10),
        highPct: expect.closeTo(10),
        highIsGood: false,
        shownBackwards: true,
      },
    ]);
  });

  it('does not flag a duration, which only rescales', () => {
    const [, duration] = multiplierPercentRows(lookup.mutaplasmid(DECAYED_HEAVY_NEUT)!, unitIdOf);
    expect(duration).toMatchObject({ attributeId: 73, shownBackwards: false });
  });
});

describe('rolledAttributeRows', () => {
  it('sets each roll beside the base and rates it in its own direction', () => {
    const rows = rolledAttributeRows(
      {
        baseTypeId: HEAVY_GREMLIN_NEUT,
        mutaplasmidTypeId: DECAYED_HEAVY_NEUT,
        attributes: { 6: 85, 73: 10500 },
      },
      lookup,
      new Map([
        [6, 100],
        [73, 10000],
      ]),
      unitIdOf
    );
    expect(rows).toEqual([
      {
        attributeId: 6,
        base: 100,
        rolled: 85,
        range: { low: 85, high: 120, highIsGood: false },
        quality: 1,
      },
      {
        attributeId: 73,
        base: 10,
        rolled: 10.5,
        range: { low: 9, high: 11, highIsGood: false },
        quality: expect.closeTo(0.25),
      },
    ]);
  });

  it('leaves out a roll the item does not carry or the base has no value for', () => {
    const rows = rolledAttributeRows(
      {
        baseTypeId: HEAVY_GREMLIN_NEUT,
        mutaplasmidTypeId: DECAYED_HEAVY_NEUT,
        attributes: { 6: 90 },
      },
      lookup,
      new Map([[73, 10000]]),
      unitIdOf
    );
    expect(rows).toEqual([]);
  });

  it('is empty for a mutaplasmid the data does not know', () => {
    expect(
      rolledAttributeRows(
        { baseTypeId: 1, mutaplasmidTypeId: 2, attributes: { 6: 1 } },
        lookup,
        new Map([[6, 1]]),
        unitIdOf
      )
    ).toEqual([]);
  });
});

describe('defaultBaseTypeId', () => {
  it('prefers the Tech II base', () => {
    expect(
      defaultBaseTypeId([
        { typeId: 1, name: 'Heavy Gremlin Compact Energy Neutralizer' },
        { typeId: 2, name: 'Heavy Energy Neutralizer II' },
        { typeId: 3, name: 'Heavy Energy Neutralizer I' },
      ])
    ).toBe(2);
  });

  it('falls back to the first by name', () => {
    expect(
      defaultBaseTypeId([
        { typeId: 1, name: 'Zeta' },
        { typeId: 2, name: 'Alpha' },
      ])
    ).toBe(2);
  });

  it('is null with no base', () => {
    expect(defaultBaseTypeId([])).toBeNull();
  });
});
