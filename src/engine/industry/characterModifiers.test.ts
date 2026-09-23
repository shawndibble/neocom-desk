import { describe, it, expect } from 'vitest';
import {
  characterModifiers,
  NO_CHARACTER_MODIFIERS,
  jobTimeMultiplier,
  refiningEfficiency,
  baselineRefiningEfficiency,
  appliedRefiningImplantPct,
  MANUFACTURING_TIME_IMPLANT_TYPE_IDS,
  REFINING_IMPLANT_TYPE_IDS,
} from './characterModifiers';
import { SKILL_IDS } from './types';

// Real ESI type IDs (issues #1227, #1229).
const BX_801 = 27170;
const BX_802 = 27167;
const BX_804 = 27171;
const RX_801 = 27175;
const RX_802 = 27169;
const RX_804 = 27174;
// Real SDE skill type ids (issue #1058).
const SIMPLE_ORE_PROCESSING = 60377;
const ICE_PROCESSING = 18025;
const MECHANICAL_ENGINEERING = 11452;
const ELECTRONIC_ENGINEERING = 11453;
const MASS_PRODUCTION = 3387;

function mods(skills: Record<number, number> = {}, implantTypeIds: number[] = []) {
  return characterModifiers({ skills, implantTypeIds });
}

describe('characterModifiers', () => {
  it('keeps the raw skill levels for fee and gate math', () => {
    const m = mods({ [SKILL_IDS.accounting]: 4 });
    expect(m.skills[SKILL_IDS.accounting]).toBe(4);
  });

  it('resolves no implant bonus with nothing fitted', () => {
    expect(NO_CHARACTER_MODIFIERS.manufacturingTimeImplantPct).toBe(0);
    expect(NO_CHARACTER_MODIFIERS.refiningImplantPct).toBe(0);
    expect(NO_CHARACTER_MODIFIERS.skills).toEqual({});
  });

  it.each([
    [BX_801, 1],
    [BX_802, 2],
    [BX_804, 4],
  ])('resolves BX-80x implant %i to a %i%% manufacturing-time bonus', (typeId, pct) => {
    expect(mods({}, [typeId]).manufacturingTimeImplantPct).toBe(pct);
    expect(mods({}, [typeId]).refiningImplantPct).toBe(0);
  });

  it.each([
    [RX_801, 1],
    [RX_802, 2],
    [RX_804, 4],
  ])('resolves RX-80x implant %i to a %i%% refining bonus', (typeId, pct) => {
    expect(mods({}, [typeId]).refiningImplantPct).toBe(pct);
    expect(mods({}, [typeId]).manufacturingTimeImplantPct).toBe(0);
  });

  it('ignores unrelated implants', () => {
    const m = mods({}, [1, 2, 3]);
    expect(m.manufacturingTimeImplantPct).toBe(0);
    expect(m.refiningImplantPct).toBe(0);
  });

  it('picks the best fitted one of a line, though only one can be fitted at once', () => {
    expect(mods({}, [BX_801, BX_804]).manufacturingTimeImplantPct).toBe(4);
    expect(mods({}, [RX_801, RX_804]).refiningImplantPct).toBe(4);
  });

  it('mirrors the known typeIDs in the implant tables', () => {
    expect(MANUFACTURING_TIME_IMPLANT_TYPE_IDS[BX_804]).toBe(4);
    expect(REFINING_IMPLANT_TYPE_IDS[RX_804]).toBe(4);
  });
});

describe('jobTimeMultiplier', () => {
  it('is 1 with no skills and no implants', () => {
    expect(jobTimeMultiplier(NO_CHARACTER_MODIFIERS, 'manufacturing')).toBe(1);
    expect(jobTimeMultiplier(NO_CHARACTER_MODIFIERS, 'reaction')).toBe(1);
  });

  it('applies Industry at 4%/level and Advanced Industry at 3%/level to manufacturing', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 });
    expect(jobTimeMultiplier(m, 'manufacturing')).toBeCloseTo(0.8 * 0.88, 12);
  });

  it('ignores Industry and Advanced Industry for a reaction (issue #513)', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 5 });
    expect(jobTimeMultiplier(m, 'reaction')).toBe(1);
  });

  it('applies Reactions at 4%/level to a reaction only', () => {
    expect(jobTimeMultiplier(mods({ [SKILL_IDS.reactions]: 5 }), 'reaction')).toBeCloseTo(0.8, 12);
    expect(jobTimeMultiplier(mods({ [SKILL_IDS.reactions]: 3 }), 'reaction')).toBeCloseTo(0.88, 12);
    expect(jobTimeMultiplier(mods({ [SKILL_IDS.reactions]: 5 }), 'manufacturing')).toBe(1);
  });

  it('applies each qualifying blueprint science skill at 1%/level (issue #1228)', () => {
    const m = mods({ [MECHANICAL_ENGINEERING]: 4, [ELECTRONIC_ENGINEERING]: 3 });
    const blueprintSkills = [
      { typeID: MECHANICAL_ENGINEERING, level: 1 },
      { typeID: ELECTRONIC_ENGINEERING, level: 1 },
    ];
    expect(jobTimeMultiplier(m, 'manufacturing', blueprintSkills)).toBeCloseTo(0.96 * 0.97, 12);
  });

  it('applies a science skill only when the blueprint names it', () => {
    const m = mods({ [MECHANICAL_ENGINEERING]: 5 });
    expect(jobTimeMultiplier(m, 'manufacturing')).toBe(1);
  });

  it('does not double count Industry/Advanced Industry listed in blueprintSkills', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 });
    const blueprintSkills = [
      { typeID: SKILL_IDS.industry, level: 1 },
      { typeID: SKILL_IDS.advancedIndustry, level: 1 },
    ];
    expect(jobTimeMultiplier(m, 'manufacturing', blueprintSkills)).toBeCloseTo(0.8 * 0.88, 12);
  });

  it('ignores a blueprint skill with no time bonus (e.g. Mass Production)', () => {
    const m = mods({ [MASS_PRODUCTION]: 5 });
    expect(jobTimeMultiplier(m, 'manufacturing', [{ typeID: MASS_PRODUCTION, level: 1 }])).toBe(1);
  });

  it('ignores blueprint science skills for a reaction', () => {
    const m = mods({ [MECHANICAL_ENGINEERING]: 5 });
    expect(jobTimeMultiplier(m, 'reaction', [{ typeID: MECHANICAL_ENGINEERING, level: 1 }])).toBe(
      1
    );
  });

  it('applies a BX-80x implant to manufacturing (issue #1229)', () => {
    expect(jobTimeMultiplier(mods({}, [BX_804]), 'manufacturing')).toBeCloseTo(0.96, 12);
  });

  it('stacks the implant with skills', () => {
    const m = mods({ [SKILL_IDS.industry]: 5, [SKILL_IDS.advancedIndustry]: 4 }, [BX_804]);
    expect(jobTimeMultiplier(m, 'manufacturing')).toBeCloseTo(0.8 * 0.88 * 0.96, 12);
  });

  it('ignores the BX-80x implant for a reaction', () => {
    expect(jobTimeMultiplier(mods({}, [BX_804]), 'reaction')).toBe(1);
  });

  it('ignores a refining implant for job time', () => {
    expect(jobTimeMultiplier(mods({}, [RX_804]), 'manufacturing')).toBe(1);
  });

  it('range-checks the skill levels it reads', () => {
    expect(() => jobTimeMultiplier(mods({ [SKILL_IDS.industry]: 6 }), 'manufacturing')).toThrow(
      RangeError
    );
    expect(() => jobTimeMultiplier(mods({ [SKILL_IDS.reactions]: 6 }), 'reaction')).toThrow(
      RangeError
    );
  });
});

describe('refiningEfficiency', () => {
  const allFive = {
    [SKILL_IDS.reprocessing]: 5,
    [SKILL_IDS.reprocessingEfficiency]: 5,
    [SIMPLE_ORE_PROCESSING]: 5,
    [ICE_PROCESSING]: 4,
    [SKILL_IDS.scrapmetalProcessing]: 2,
  };

  it('is the bare station rate with nothing trained', () => {
    expect(refiningEfficiency(NO_CHARACTER_MODIFIERS, SIMPLE_ORE_PROCESSING)).toBeCloseTo(0.5, 10);
    expect(refiningEfficiency(NO_CHARACTER_MODIFIERS, undefined)).toBeCloseTo(0.5, 10);
  });

  it("stacks Reprocessing, Reprocessing Efficiency and the ore's own specialisation", () => {
    expect(refiningEfficiency(mods(allFive), SIMPLE_ORE_PROCESSING)).toBeCloseTo(
      0.5 * 1.15 * 1.1 * 1.1,
      10
    );
  });

  it('resolves ice to Ice Processing, not Scrapmetal', () => {
    expect(refiningEfficiency(mods(allFive), ICE_PROCESSING)).toBeCloseTo(
      0.5 * 1.15 * 1.1 * 1.08,
      10
    );
  });

  it('gives scrap only Scrapmetal Processing (issue #1226)', () => {
    expect(refiningEfficiency(mods(allFive), undefined)).toBeCloseTo(0.5 * 1.04, 10);
  });

  it('applies a refining implant to ore (issue #1227)', () => {
    expect(refiningEfficiency(mods({}, [RX_804]), SIMPLE_ORE_PROCESSING)).toBeCloseTo(
      0.5 * 1.04,
      10
    );
  });

  it('does not apply a refining implant to scrap', () => {
    expect(refiningEfficiency(mods({}, [RX_804]), undefined)).toBeCloseTo(0.5, 10);
  });

  it('ignores a manufacturing implant', () => {
    expect(refiningEfficiency(mods({}, [BX_804]), SIMPLE_ORE_PROCESSING)).toBeCloseTo(0.5, 10);
  });
});

describe('baselineRefiningEfficiency', () => {
  it('is the general skills and implant over the station rate, with no specialisation', () => {
    const m = mods(
      {
        [SKILL_IDS.reprocessing]: 5,
        [SKILL_IDS.reprocessingEfficiency]: 5,
        [SIMPLE_ORE_PROCESSING]: 5,
      },
      [RX_802]
    );
    expect(baselineRefiningEfficiency(m)).toBeCloseTo(0.5 * 1.15 * 1.1 * 1.02, 10);
  });
});

describe('appliedRefiningImplantPct', () => {
  it('is the implant bonus for ore, since it applied', () => {
    expect(appliedRefiningImplantPct(mods({}, [RX_804]), SIMPLE_ORE_PROCESSING)).toBe(4);
  });

  it('is 0 for scrap, which never sees the implant (issue #1227)', () => {
    expect(appliedRefiningImplantPct(mods({}, [RX_804]), undefined)).toBe(0);
  });

  it('is 0 with no implant fitted', () => {
    expect(appliedRefiningImplantPct(NO_CHARACTER_MODIFIERS, SIMPLE_ORE_PROCESSING)).toBe(0);
  });
});
