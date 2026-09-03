import { describe, expect, it } from 'vitest';
import {
  collectAttributeIdReferences,
  groupItemAttributes,
  type AttributeDictionary,
} from './itemAttributes';

const DICTIONARY: AttributeDictionary = {
  9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
  38: { name: 'Capacity', unit: 'm3', category: 'Fitting' },
  30: { name: 'Powergrid Usage', unit: null, category: 'Fitting' },
  182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
  183: { name: 'Secondary Skill required', unit: 'typeID', category: 'Required Skills' },
  786: { name: 'Crystals Take Damage', unit: '1=True 0=False', category: 'Miscellaneous' },
  128: { name: 'Charge size', unit: '1=small 2=medium 3=l', category: 'Miscellaneous' },
  137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
  180: { name: 'Primary attribute', unit: 'attributeID', category: 'Miscellaneous' },
  165: { name: 'Intelligence', unit: 'points', category: 'Miscellaneous' },
  1298: { name: 'Can only be fitted to', unit: 'groupID', category: 'Fitting' },
  1632: { name: 'Planet Type Restriction', unit: 'typeID', category: 'Miscellaneous' },
};

const NAMES = {
  types: { 24241: 'Caldari Frigate', 3436: 'Spaceship Command', 11: 'Temperate' },
  groups: { 483: 'Mining Laser', 25: 'Frigate' },
};

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

  it('resolves a groupID unit to the Group name, with no raw unit left over', () => {
    const groups = groupItemAttributes([{ attribute_id: 137, value: 483 }], DICTIONARY, NAMES);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 137,
      name: 'Used with (Launcher Group)',
      unit: null,
      value: 483,
      displayValue: 'Mining Laser',
    });
  });

  it('resolves a typeID unit outside the required-skill pairs', () => {
    const groups = groupItemAttributes([{ attribute_id: 1632, value: 11 }], DICTIONARY, NAMES);
    expect(groups[0].attributes[0].displayValue).toBe('Temperate');
  });

  it('resolves an attributeID unit from the dictionary it already has', () => {
    const groups = groupItemAttributes([{ attribute_id: 180, value: 165 }], DICTIONARY, NAMES);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 180,
      name: 'Primary attribute',
      unit: null,
      value: 165,
      displayValue: 'Intelligence',
    });
  });

  it('leaves an unresolvable id exactly as it renders today, rather than nulling the unit', () => {
    const groups = groupItemAttributes([{ attribute_id: 1298, value: 99999 }], DICTIONARY, NAMES);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 1298,
      name: 'Can only be fitted to',
      unit: 'groupID',
      value: 99999,
    });
  });

  it('leaves a zero sentinel alone — an unused slot is no group', () => {
    const groups = groupItemAttributes([{ attribute_id: 1298, value: 0 }], DICTIONARY, NAMES);
    expect(groups[0].attributes[0].unit).toBe('groupID');
    expect(groups[0].attributes[0].displayValue).toBeUndefined();
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
    const groups = groupItemAttributes([{ attribute_id: 128, value: 9 }], DICTIONARY);
    expect(groups[0].attributes[0]).toEqual({
      attributeId: 128,
      name: 'Charge size',
      unit: null,
      value: 9,
    });
  });

  it('names size class 4, which the truncated legend cannot show', () => {
    const groups = groupItemAttributes([{ attribute_id: 128, value: 4 }], DICTIONARY);
    expect(groups[0].attributes[0].displayValue).toBe('X-Large');
  });

  it('resolves a required-skill attribute to a skill name and roman-numeral level', () => {
    const groups = groupItemAttributes(
      [
        { attribute_id: 182, value: 24241 },
        { attribute_id: 277, value: 3 },
      ],
      DICTIONARY,
      NAMES
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
    const groups = groupItemAttributes([{ attribute_id: 183, value: 3436 }], DICTIONARY, NAMES);
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
      NAMES
    );
    expect(groups[0].attributes).toHaveLength(1);
  });
});

describe('collectAttributeIdReferences', () => {
  it('splits the ids an item references by the kind of thing they name', () => {
    expect(
      collectAttributeIdReferences(
        [
          { attribute_id: 137, value: 483 },
          { attribute_id: 1298, value: 25 },
          { attribute_id: 1632, value: 11 },
          { attribute_id: 9, value: 1200 }, // a real unit — not a reference
          { attribute_id: 99999, value: 7 }, // no dictionary entry
        ],
        DICTIONARY
      )
    ).toEqual({ typeIds: [11], groupIds: [483, 25] });
  });

  it('includes the required-skill typeIDs, so one lookup covers every referenced type', () => {
    expect(collectAttributeIdReferences([{ attribute_id: 182, value: 3436 }], DICTIONARY)).toEqual({
      typeIds: [3436],
      groupIds: [],
    });
  });

  it('omits attributeID references — the dictionary already names those', () => {
    expect(collectAttributeIdReferences([{ attribute_id: 180, value: 165 }], DICTIONARY)).toEqual({
      typeIds: [],
      groupIds: [],
    });
  });

  it('drops ids that cannot name anything, so no lookup is wasted on them', () => {
    expect(
      collectAttributeIdReferences(
        [
          { attribute_id: 1298, value: 0 },
          { attribute_id: 1632, value: -1 },
          { attribute_id: 137, value: 1.5 },
        ],
        DICTIONARY
      )
    ).toEqual({ typeIds: [], groupIds: [] });
  });

  it('de-duplicates, so an item naming one group five times asks for it once', () => {
    expect(
      collectAttributeIdReferences(
        [
          { attribute_id: 137, value: 483 },
          { attribute_id: 1298, value: 483 },
        ],
        DICTIONARY
      )
    ).toEqual({ typeIds: [], groupIds: [483] });
  });

  it('returns empty lists for a type with no dogma attributes', () => {
    expect(collectAttributeIdReferences(undefined, DICTIONARY)).toEqual({
      typeIds: [],
      groupIds: [],
    });
  });
});
