import { describe, it, expect } from 'vitest';
import {
  reprocessingEfficiency,
  reprocessingYield,
  reprocessingValue,
  resolveSpecialisationLevel,
  resolveReprocessingSkills,
  resolveImplantBonusPct,
  BASE_STATION_REPROCESSING_RATE,
  REFINING_IMPLANT_TYPE_IDS,
} from './reprocessing';
import { SKILL_IDS } from './types';

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

  it('ignores Reprocessing and Reprocessing Efficiency for scrap, applying only the specialisation (Scrapmetal Processing) bonus (issue #1226)', () => {
    // 0.5 x 1.10 (Scrapmetal V only) — Reprocessing V and Reprocessing
    // Efficiency V are trained but must not apply to scrap.
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 5,
        reprocessingEfficiencyLevel: 5,
        specialisationLevel: 5,
        isScrap: true,
      })
    ).toBeCloseTo(0.5 * 1.1, 10);
  });

  it('is the bare station rate for untrained scrap, same as untrained ore', () => {
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 0,
        reprocessingEfficiencyLevel: 0,
        specialisationLevel: 0,
        isScrap: true,
      })
    ).toBeCloseTo(0.5, 10);
  });

  it('applies a refining implant bonus on top of the skill multipliers (issue #1227)', () => {
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 0,
        reprocessingEfficiencyLevel: 0,
        specialisationLevel: 0,
        implantBonusPct: 4,
      })
    ).toBeCloseTo(0.5 * 1.04, 10);
  });

  it("does not apply a refining implant to scrap — the RX-80x line's own description covers ore and ice only (issue #1227)", () => {
    expect(
      reprocessingEfficiency({
        reprocessingLevel: 0,
        reprocessingEfficiencyLevel: 0,
        specialisationLevel: 0,
        isScrap: true,
        implantBonusPct: 4,
      })
    ).toBeCloseTo(0.5, 10);
  });
});

describe('resolveImplantBonusPct', () => {
  // Real ESI type IDs for the Zainou 'Beancounter' Reprocessing line
  // (issue #1227): "+N% bonus to ore and ice reprocessing yield".
  const RX_801 = 27175;
  const RX_802 = 27169;
  const RX_804 = 27174;

  it('is 0 with no implants fitted', () => {
    expect(resolveImplantBonusPct([])).toBe(0);
  });

  it.each([
    [RX_801, 1],
    [RX_802, 2],
    [RX_804, 4],
  ])('resolves implant %i to a %i%% bonus', (typeId, pct) => {
    expect(resolveImplantBonusPct([typeId])).toBe(pct);
  });

  it('ignores implants that are not the refining line', () => {
    expect(resolveImplantBonusPct([1, 2, 3])).toBe(0);
  });

  it('mirrors the known typeIDs in REFINING_IMPLANT_TYPE_IDS', () => {
    expect(REFINING_IMPLANT_TYPE_IDS[RX_801]).toBe(1);
    expect(REFINING_IMPLANT_TYPE_IDS[RX_802]).toBe(2);
    expect(REFINING_IMPLANT_TYPE_IDS[RX_804]).toBe(4);
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

describe('resolveSpecialisationLevel', () => {
  // Real SDE skill type ids (issue #1058), so this test doubles as
  // documentation of what the bake's attribute-790 join actually resolves.
  const SIMPLE_ORE_PROCESSING = 60377;
  const ICE_PROCESSING = 18025;

  it('resolves a known ore type to its own specialisation, not Scrapmetal', () => {
    const trained = new Map([
      [SIMPLE_ORE_PROCESSING, { level: 3, sp: 0 }],
      [SKILL_IDS.scrapmetalProcessing, { level: 5, sp: 0 }],
    ]);
    expect(resolveSpecialisationLevel(SIMPLE_ORE_PROCESSING, trained)).toBe(3);
  });

  it('resolves a known ice type to Ice Processing, not Scrapmetal', () => {
    const trained = new Map([
      [ICE_PROCESSING, { level: 4, sp: 0 }],
      [SKILL_IDS.scrapmetalProcessing, { level: 1, sp: 0 }],
    ]);
    expect(resolveSpecialisationLevel(ICE_PROCESSING, trained)).toBe(4);
  });

  it('falls back to Scrapmetal Processing for a known module, which carries no specialisation attribute', () => {
    const trained = new Map([[SKILL_IDS.scrapmetalProcessing, { level: 2, sp: 0 }]]);
    expect(resolveSpecialisationLevel(undefined, trained)).toBe(2);
  });

  it('is 0 when the resolved skill is untrained', () => {
    expect(resolveSpecialisationLevel(undefined, new Map())).toBe(0);
  });
});

describe('resolveReprocessingSkills', () => {
  it('marks a type with no specialisation attribute as scrap (issue #1226)', () => {
    const trained = new Map([[SKILL_IDS.scrapmetalProcessing, { level: 2, sp: 0 }]]);
    const skills = resolveReprocessingSkills(
      { reprocessingLevel: 5, reprocessingEfficiencyLevel: 5 },
      undefined,
      trained
    );
    expect(skills.isScrap).toBe(true);
    expect(skills.specialisationLevel).toBe(2);
  });

  it('does not mark an ore/ice/moon-ore type as scrap', () => {
    const SIMPLE_ORE_PROCESSING = 60377;
    const trained = new Map([[SIMPLE_ORE_PROCESSING, { level: 3, sp: 0 }]]);
    const skills = resolveReprocessingSkills(
      { reprocessingLevel: 5, reprocessingEfficiencyLevel: 5 },
      SIMPLE_ORE_PROCESSING,
      trained
    );
    expect(skills.isScrap).toBe(false);
    expect(skills.specialisationLevel).toBe(3);
  });
});
