import { describe, it, expect } from 'vitest';
import { extractAttributeBonuses, extractRequiredSkills, sumAttributeBonuses } from './dogma';

// Fixture mirrors a live ESI response for type 10209, "Memory Augmentation -
// Improved" (+5 Bonus to Memory; requires Cybernetics V via 182/277).
const MEMORY_IMPLANT_DOGMA = [
  { attribute_id: 175, value: 0.0 },
  { attribute_id: 176, value: 0.0 },
  { attribute_id: 177, value: 5.0 },
  { attribute_id: 178, value: 0.0 },
  { attribute_id: 179, value: 0.0 },
  { attribute_id: 277, value: 5.0 },
  { attribute_id: 182, value: 3411.0 },
];

// Fixture mirrors a live ESI response for type 587, "Rifter" (requires
// Minmatar Frigate I via 182/277 only — no other requiredSkill pairs set).
const RIFTER_DOGMA = [
  { attribute_id: 3, value: 0.0 },
  { attribute_id: 182, value: 3329.0 },
  { attribute_id: 277, value: 1.0 },
];

describe('extractAttributeBonuses', () => {
  it('extracts only the non-zero attribute bonus', () => {
    expect(extractAttributeBonuses(MEMORY_IMPLANT_DOGMA)).toEqual({ memory: 5 });
  });

  it('returns an empty object for undefined dogma_attributes', () => {
    expect(extractAttributeBonuses(undefined)).toEqual({});
  });

  it('returns an empty object when every bonus attribute is zero', () => {
    expect(extractAttributeBonuses(RIFTER_DOGMA)).toEqual({});
  });
});

describe('sumAttributeBonuses', () => {
  it('sums per attribute across multiple implants', () => {
    expect(
      sumAttributeBonuses([{ memory: 5 }, { memory: 3, perception: 4 }, { charisma: 2 }])
    ).toEqual({ memory: 8, perception: 4, charisma: 2 });
  });

  it('returns an empty map for no implants', () => {
    expect(sumAttributeBonuses([])).toEqual({});
  });

  it('ignores explicit zero entries', () => {
    expect(sumAttributeBonuses([{ memory: 0 }])).toEqual({});
  });
});

describe('extractRequiredSkills', () => {
  it('extracts a single requiredSkill pair (Rifter -> Minmatar Frigate I)', () => {
    expect(extractRequiredSkills(RIFTER_DOGMA)).toEqual([{ skillTypeID: 3329, level: 1 }]);
  });

  it('extracts a requiredSkill pair alongside unrelated attribute bonuses', () => {
    expect(extractRequiredSkills(MEMORY_IMPLANT_DOGMA)).toEqual([{ skillTypeID: 3411, level: 5 }]);
  });

  it('returns an empty array for undefined dogma_attributes', () => {
    expect(extractRequiredSkills(undefined)).toEqual([]);
  });

  it('skips a requiredSkill slot whose typeID attribute is 0 or absent', () => {
    expect(extractRequiredSkills([{ attribute_id: 183, value: 0 }])).toEqual([]);
    expect(extractRequiredSkills([{ attribute_id: 278, value: 3 }])).toEqual([]);
  });

  it('resolves all 6 requiredSkill slots using the verified (non-sequential) pairing', () => {
    const dogma = [
      { attribute_id: 182, value: 1 },
      { attribute_id: 277, value: 1 },
      { attribute_id: 183, value: 2 },
      { attribute_id: 278, value: 2 },
      { attribute_id: 184, value: 3 },
      { attribute_id: 279, value: 3 },
      { attribute_id: 1285, value: 4 },
      { attribute_id: 1286, value: 4 },
      { attribute_id: 1289, value: 5 },
      { attribute_id: 1287, value: 5 }, // requiredSkill5Level, NOT 1288
      { attribute_id: 1290, value: 6 },
      { attribute_id: 1288, value: 6 }, // requiredSkill6Level, NOT 1287
    ];
    expect(extractRequiredSkills(dogma)).toEqual([
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 2, level: 2 },
      { skillTypeID: 3, level: 3 },
      { skillTypeID: 4, level: 4 },
      { skillTypeID: 5, level: 5 },
      { skillTypeID: 6, level: 6 },
    ]);
  });

  it('rounds float typeIDs/levels to integers', () => {
    expect(extractRequiredSkills([{ attribute_id: 182, value: 3329.0 }])).toEqual([
      { skillTypeID: 3329, level: 0 },
    ]);
  });
});
