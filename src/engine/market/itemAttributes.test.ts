import { describe, expect, it } from 'vitest';
import { groupItemAttributes, type AttributeDictionary } from './itemAttributes';

const DICTIONARY: AttributeDictionary = {
  9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
  38: { name: 'Capacity', unit: 'm3', category: 'Fitting' },
  30: { name: 'Powergrid Usage', unit: null, category: 'Fitting' },
  182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
  183: { name: 'Secondary Skill required', unit: 'typeID', category: 'Required Skills' },
  786: { name: 'Crystals Take Damage', unit: '1=True 0=False', category: 'Miscellaneous' },
  128: { name: 'Charge size', unit: '1=small 2=medium 3=l', category: 'Miscellaneous' },
};

const SKILL_NAMES = { 24241: 'Caldari Frigate', 3436: 'Spaceship Command' };

describe('groupItemAttributes', () => {
  it('returns an empty list when the type has no dogma attributes', () => {
    expect(groupItemAttributes(undefined, DICTIONARY)).toEqual([]);
    expect(groupItemAttributes([], DICTIONARY)).toEqual([]);
  });

  it('skips attribute ids missing from the dictionary rather than showing a raw id', () => {
    const groups = groupItemAttributes(
      [
        { attribute_id: 9, value: 1200 },
        { attribute_id: 99999, value: 42 }, // unpublished / unnamed — no dictionary entry
      ],
      DICTIONARY
    );
    expect(groups).toEqual([
      {
        category: 'Structure',
        attributes: [{ attributeId: 9, name: 'Structure Hitpoints', unit: 'HP', value: 1200 }],
      },
    ]);
  });

  it('groups attributes by category and sorts categories and attributes alphabetically', () => {
    const groups = groupItemAttributes(
      [
        { attribute_id: 37, value: 250 },
        { attribute_id: 38, value: 100 },
        { attribute_id: 30, value: 50 },
        { attribute_id: 9, value: 1200 },
      ],
      DICTIONARY
    );

    expect(groups.map((g) => g.category)).toEqual(['Fitting', 'Speed and Travel', 'Structure']);
    expect(groups[0].attributes.map((a) => a.name)).toEqual(['Capacity', 'Powergrid Usage']);
  });

  it('passes through a null unit unchanged', () => {
    const groups = groupItemAttributes([{ attribute_id: 30, value: 50 }], DICTIONARY);
    expect(groups[0].attributes[0].unit).toBeNull();
  });

  it('resolves an enum-legend unit to the member the value names', () => {
    const groups = groupItemAttributes([{ attribute_id: 786, value: 1 }], DICTIONARY);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 786,
      name: 'Crystals Take Damage',
      unit: null,
      value: 1,
      displayValue: 'True',
    });
  });

  it('repairs the size legend the SDE truncates, rather than showing "3=l"', () => {
    const groups = groupItemAttributes([{ attribute_id: 128, value: 3 }], DICTIONARY);
    expect(groups[0].attributes[0].displayValue).toBe('Large');
  });

  it('drops an enum legend the value falls outside of, so the bare number shows', () => {
    const groups = groupItemAttributes([{ attribute_id: 128, value: 4 }], DICTIONARY);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 128,
      name: 'Charge size',
      unit: null,
      value: 4,
    });
  });

  it('resolves a required-skill attribute to a skill name and roman-numeral level', () => {
    const groups = groupItemAttributes(
      [
        { attribute_id: 182, value: 24241 },
        { attribute_id: 277, value: 3 },
      ],
      DICTIONARY,
      SKILL_NAMES
    );
    expect(groups).toEqual([
      {
        category: 'Required Skills',
        attributes: [
          {
            attributeId: 182,
            name: 'Primary Skill required',
            unit: null,
            value: 24241,
            displayValue: 'Caldari Frigate III',
          },
        ],
      },
    ]);
  });

  it('defaults a required-skill level to I when ESI omits the level attribute', () => {
    const groups = groupItemAttributes(
      [{ attribute_id: 183, value: 3436 }],
      DICTIONARY,
      SKILL_NAMES
    );
    expect(groups[0].attributes[0].displayValue).toBe('Spaceship Command I');
  });

  it('falls back to a #typeId label for a skill missing from the name map', () => {
    const groups = groupItemAttributes([{ attribute_id: 182, value: 99887766 }], DICTIONARY, {});
    expect(groups[0].attributes[0].displayValue).toBe('#99887766 I');
  });

  it('does not also emit the raw skill/level attributes through the generic loop', () => {
    const groups = groupItemAttributes(
      [
        { attribute_id: 182, value: 24241 },
        { attribute_id: 277, value: 3 },
      ],
      DICTIONARY,
      SKILL_NAMES
    );
    expect(groups[0].attributes).toHaveLength(1);
  });
});
