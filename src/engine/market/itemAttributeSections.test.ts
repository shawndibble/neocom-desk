import { describe, expect, it } from 'vitest';
import type { AttributeDictionary, RawDogmaAttribute } from './itemAttributes';
import {
  itemAttributeSections,
  itemKindOf,
  withSkilledValues,
  type AttributeSection,
  type ItemKind,
} from './itemAttributeSections';

const RES = { category: '', unit: '%', unitId: 108 };
const DICTIONARY: AttributeDictionary = {
  9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure', unitId: 113 },
  4: { name: 'Mass', unit: 'kg', category: 'Structure', unitId: 2 },
  263: { name: 'Shield Capacity', unit: 'HP', category: 'Shield', unitId: 113 },
  479: { name: 'Shield recharge time', unit: 's', category: 'Shield', unitId: 101 },
  265: { name: 'Armor Hitpoints', unit: 'HP', category: 'Armor', unitId: 113 },
  271: { ...RES, name: 'Shield EM Damage Resistance', category: 'Shield' },
  272: { ...RES, name: 'Shield Explosive Damage Resistance', category: 'Shield' },
  273: { ...RES, name: 'Shield Kinetic Damage Resistance', category: 'Shield' },
  274: { ...RES, name: 'Shield Thermal Damage Resistance', category: 'Shield' },
  267: { ...RES, name: 'Armor EM Damage Resistance', category: 'Armor' },
  268: { ...RES, name: 'Armor Explosive Damage Resistance', category: 'Armor' },
  269: { ...RES, name: 'Armor Kinetic Damage Resistance', category: 'Armor' },
  270: { ...RES, name: 'Armor Thermal Damage Resistance', category: 'Armor' },
  113: { ...RES, name: 'Structure EM Damage Resistance', category: 'Structure' },
  111: { ...RES, name: 'Structure Explosive Damage Resistance', category: 'Structure' },
  109: { ...RES, name: 'Structure Kinetic Damage Resistance', category: 'Structure' },
  110: { ...RES, name: 'Structure Thermal Damage Resistance', category: 'Structure' },
  14: { name: 'High Slots', unit: '', category: 'Fitting', unitId: 122 },
  48: { name: 'CPU Output', unit: 'tf', category: 'Fitting', unitId: 106 },
  50: { name: 'CPU usage', unit: 'tf', category: 'Fitting', unitId: 106 },
  6: { name: 'Activation Cost', unit: 'GJ', category: 'Capacitor', unitId: 114 },
  55: { name: 'Capacitor Recharge time', unit: 's', category: 'Capacitor', unitId: 101 },
  76: { name: 'Maximum Targeting Range', unit: 'm', category: 'Targeting', unitId: 1 },
  37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel', unitId: 11 },
  283: { name: 'Drone Capacity', unit: 'm3', category: 'Drones', unitId: 9 },
  54: { name: 'Optimal Range', unit: 'm', category: 'Turrets', unitId: 1 },
  77: { name: 'Mining amount', unit: 'm3', category: 'Mining', unitId: 9 },
  3153: { name: 'Residue Probability', unit: '%', category: 'Mining', unitId: 121 },
  73: { name: 'Activation time / duration', unit: 's', category: 'Miscellaneous', unitId: 101 },
  633: { name: 'Meta Level', unit: 'Level', category: 'Miscellaneous', unitId: 140 },
  1271: { name: 'Bandwidth', unit: 'Mbit/sec', category: 'Other', unitId: 128 },
  1211: { name: 'Heat Damage', unit: 'HP', category: 'Heat', unitId: 113 },
  114: { name: 'EM damage', unit: 'HP', category: 'Turrets', unitId: 113 },
};

const attrs = (pairs: Record<number, number>): RawDogmaAttribute[] =>
  Object.entries(pairs).map(([id, value]) => ({ attribute_id: Number(id), value }));

/** Section headings in order, the resist grid as "RESISTS". */
const order = (sections: AttributeSection[]) =>
  sections.map((s) => (s.kind === 'resists' ? 'RESISTS' : s.group.category));

const sectionsFor = (kind: ItemKind, pairs: Record<number, number>, omit?: number[]) =>
  itemAttributeSections(
    attrs(pairs),
    DICTIONARY,
    {},
    {
      kind,
      omitAttributeIds: omit ? new Set(omit) : undefined,
    }
  );

const ZEALOT = {
  4: 12580000,
  9: 1670,
  113: 0.67,
  111: 0.67,
  109: 0.67,
  110: 0.67,
  263: 980,
  271: 1,
  272: 0.125,
  273: 0.3,
  274: 0.8,
  479: 1250000,
  265: 2250,
  267: 0.5,
  268: 0.2,
  269: 0.375,
  270: 0.65,
  14: 5,
  48: 340,
  55: 285000,
  76: 60000,
  37: 210,
  283: 50,
  633: 5,
  1271: 0,
};

describe('itemKindOf', () => {
  it('reads a hull off its rack sizes', () => {
    expect(itemKindOf(attrs({ 14: 5, 13: 3, 12: 7 }), [])).toBe('hull');
  });

  it('reads a module off the slot effect that racks it', () => {
    for (const effect of [11, 12, 13, 2663, 3772]) {
      expect(itemKindOf(attrs({ 50: 30 }), [{ effect_id: effect }])).toBe('module');
    }
  });

  it('calls anything else other (a drone, a charge, a mineral)', () => {
    expect(itemKindOf(attrs({ 9: 240 }), [{ effect_id: 10 }])).toBe('other');
    expect(itemKindOf(undefined, undefined)).toBe('other');
  });
});

describe('itemAttributeSections', () => {
  it('puts a hull’s fitting, then its resist grid and layers, then capacitor, targeting, speed, drones', () => {
    expect(order(sectionsFor('hull', ZEALOT))).toEqual([
      'Fitting',
      'RESISTS',
      'Shield',
      'Structure',
      'Capacitor',
      'Targeting',
      'Speed and Travel',
      'Drones',
      'Other',
      'Miscellaneous',
    ]);
  });

  it('draws shield, armor and hull resists as one grid with each layer’s HP, out of the rows', () => {
    const sections = sectionsFor('hull', ZEALOT);
    const grid = sections.find((s) => s.kind === 'resists');
    expect(grid).toEqual({
      kind: 'resists',
      layers: [
        {
          layer: 'shield',
          hp: 980,
          resonances: {
            emResonance: 1,
            thermalResonance: 0.8,
            kineticResonance: 0.3,
            explosiveResonance: 0.125,
          },
        },
        {
          layer: 'armor',
          hp: 2250,
          resonances: {
            emResonance: 0.5,
            thermalResonance: 0.65,
            kineticResonance: 0.375,
            explosiveResonance: 0.2,
          },
        },
        {
          layer: 'hull',
          hp: 1670,
          resonances: {
            emResonance: 0.67,
            thermalResonance: 0.67,
            kineticResonance: 0.67,
            explosiveResonance: 0.67,
          },
        },
      ],
    });
    const rowIds = sections.flatMap((s) =>
      s.kind === 'group' ? s.group.attributes.map((a) => a.attributeId) : []
    );
    for (const id of [9, 263, 265, 267, 268, 269, 270, 271, 272, 273, 274, 109, 110, 111, 113]) {
      expect(rowIds).not.toContain(id);
    }
    // What the grid doesn't carry stays in its group.
    expect(rowIds).toContain(479);
    expect(rowIds).toContain(4);
  });

  it('leaves a layer missing a resonance as rows, not a half-empty grid row', () => {
    const sections = sectionsFor('other', { 263: 60, 271: 1, 272: 0.5, 273: 0.6, 9: 120 });
    expect(sections.some((s) => s.kind === 'resists')).toBe(false);
    expect(order(sections)).toEqual(['Shield', 'Structure']);
  });

  it('keeps a module’s own structure HP out of the grid: it is not a layer it gives', () => {
    // Damage Control II: resonance multipliers on every layer, 40 HP of its own.
    const sections = sectionsFor('module', {
      9: 40,
      4: 5000,
      113: 0.6,
      111: 0.6,
      109: 0.6,
      110: 0.6,
      267: 0.85,
      268: 0.85,
      269: 0.85,
      270: 0.85,
      271: 0.875,
      272: 0.875,
      273: 0.875,
      274: 0.875,
      50: 30,
      633: 5,
    });
    const grid = sections.find((s) => s.kind === 'resists');
    expect(grid?.kind === 'resists' && grid.layers.map((l) => [l.layer, l.hp])).toEqual([
      ['shield', null],
      ['armor', null],
      ['hull', null],
    ]);
    expect(order(sections)).toEqual(['Fitting', 'RESISTS', 'Structure', 'Miscellaneous']);
  });

  it('leads a module with fitting, then its main effect (its largest own group), then capacitor', () => {
    // Gas Cloud Scoop II.
    const sections = sectionsFor('module', {
      9: 40,
      4: 0,
      6: 15,
      50: 70,
      54: 1500,
      73: 40000,
      633: 5,
      77: 20,
      3153: 0.34,
      1211: 1,
    });
    expect(order(sections)).toEqual([
      'Fitting',
      'Mining',
      'Turrets',
      'Capacitor',
      'Heat',
      'Structure',
      'Miscellaneous',
    ]);
  });

  it('leads anything else with its largest groups, defences after them, Miscellaneous last', () => {
    // A drone: damage, a little targeting and speed, layers of its own.
    const sections = sectionsFor('other', {
      54: 2100,
      114: 0,
      37: 3360,
      9: 240,
      113: 1,
      111: 1,
      109: 1,
      110: 1,
      633: 5,
    });
    expect(order(sections)).toEqual(['Turrets', 'Speed and Travel', 'RESISTS', 'Miscellaneous']);
  });

  it('leaves out omitted ids, from the grid as well as the rows', () => {
    // A mutated module whose rolls already show the armor resists.
    const sections = sectionsFor('hull', ZEALOT, [267, 50]);
    const grid = sections.find((s) => s.kind === 'resists');
    expect(grid?.kind === 'resists' && grid.layers.map((l) => l.layer)).toEqual(['shield', 'hull']);
    const rowIds = sections.flatMap((s) =>
      s.kind === 'group' ? s.group.attributes.map((a) => a.attributeId) : []
    );
    expect(rowIds).not.toContain(267);
    // The rest of the armor layer falls back to rows.
    expect(rowIds).toEqual(expect.arrayContaining([265, 268, 269, 270]));
  });
});

describe('withSkilledValues', () => {
  const hull = (values: Record<number, number>): RawDogmaAttribute[] =>
    Object.entries(values).map(([id, value]) => ({ attribute_id: Number(id), value }));
  const sections = itemAttributeSections(
    hull({ 265: 2250, 55: 285000, 37: 220, 9: 1000, 267: 0.5, 268: 0.2, 269: 0.375, 270: 0.65 }),
    DICTIONARY,
    {},
    { kind: 'other' }
  );
  const skilled = new Map([
    [265, 2812.5],
    [55, 213750],
    [37, 220],
    [267, 0.5],
    [268, 0.2],
    [269, 0.375],
    [270, 0.65],
  ]);
  const row = (all: AttributeSection[], id: number) =>
    all
      .flatMap((s) => (s.kind === 'group' ? s.group.attributes : []))
      .find((a) => a.attributeId === id);

  it('gives a row the skilled value in the unit it shows, converted like its base', () => {
    const out = withSkilledValues(sections, skilled);
    expect(row(out, 55)?.skilledValue).toBeCloseTo(213.75, 6);
    expect(row(out, 55)?.value).toBeCloseTo(285, 6);
  });

  it('leaves a row the pilot does not change, or the engine did not report, without one', () => {
    const out = withSkilledValues(sections, skilled);
    expect(row(out, 37)?.skilledValue).toBeUndefined();
    expect(row(out, 9)?.skilledValue).toBeUndefined();
  });

  it('gives a resist layer its skilled HP and resonances', () => {
    const out = withSkilledValues(sections, skilled);
    const grid = out.find((s) => s.kind === 'resists');
    const armor = grid?.kind === 'resists' ? grid.layers.find((l) => l.layer === 'armor') : null;
    expect(armor?.skilled?.hp).toBeCloseTo(2812.5, 6);
    expect(armor?.skilled?.resonances.emResonance).toBeCloseTo(0.5, 6);
  });

  it('changes nothing without skilled values', () => {
    expect(withSkilledValues(sections, new Map())).toEqual(sections);
  });
});
