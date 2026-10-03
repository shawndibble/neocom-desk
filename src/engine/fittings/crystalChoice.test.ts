import { describe, expect, it } from 'vitest';
import type { ChargeChoice } from './chargeChoice';
import { CRYSTAL_FAMILY_ORES, groupCrystals, parseCrystal } from './crystalChoice';

function crystal(typeId: number, name: string): ChargeChoice {
  return {
    typeId,
    name,
    baseTypeId: typeId,
    baseName: name,
    tier: name.endsWith(' II') ? 'tech2' : 'tech1',
    faction: null,
    dps: 0,
    optimal: 0,
    falloff: 0,
    damage: null,
    price: null,
    roundsPerMinute: null,
    cargo: 0,
    skillMissing: false,
  };
}

describe('parseCrystal', () => {
  it('reads the family, letter and tech level off the name', () => {
    expect(parseCrystal('Simple Asteroid Mining Crystal Type A II')).toEqual({
      family: 'Simple Asteroid',
      letter: 'A',
      techLevel: 2,
    });
    expect(parseCrystal('Exceptional Moon Mining Crystal Type C I')).toEqual({
      family: 'Exceptional Moon',
      letter: 'C',
      techLevel: 1,
    });
    expect(parseCrystal('Erratic Ore Mining Crystal Type B I')?.family).toBe('Erratic Ore');
  });

  it('is null for anything else', () => {
    expect(parseCrystal('Cap Booster 400')).toBeNull();
  });
});

describe('groupCrystals', () => {
  it('groups by family in belt order, each A I, A II, B I, B II, C I, C II', () => {
    const groups = groupCrystals([
      crystal(6, 'Simple Asteroid Mining Crystal Type C II'),
      crystal(1, 'Coherent Asteroid Mining Crystal Type A I'),
      crystal(2, 'Simple Asteroid Mining Crystal Type A II'),
      crystal(3, 'Simple Asteroid Mining Crystal Type B I'),
      crystal(4, 'Simple Asteroid Mining Crystal Type A I'),
    ]);
    expect(groups.map((g) => g.family)).toEqual(['Simple Asteroid', 'Coherent Asteroid']);
    expect(groups[0]!.crystals.map((c) => `${c.letter} ${c.techLevel}`)).toEqual([
      'A 1',
      'A 2',
      'B 1',
      'C 2',
    ]);
    expect(groups[0]!.ores).toEqual(['Veldspar', 'Scordite', 'Pyroxeres', 'Plagioclase']);
  });

  it('leaves out charges that are not crystals', () => {
    expect(groupCrystals([crystal(9, 'Cap Booster 400')])).toEqual([]);
  });
});

describe('CRYSTAL_FAMILY_ORES', () => {
  it('names the ores of every asteroid and moon family', () => {
    expect(CRYSTAL_FAMILY_ORES['Complex Asteroid']).toEqual(['Arkonor', 'Bistot', 'Spodumain']);
    expect(CRYSTAL_FAMILY_ORES['Rare Moon']).toEqual([
      'Carnotite',
      'Zircon',
      'Pollucite',
      'Cinnabar',
    ]);
    expect(CRYSTAL_FAMILY_ORES['Mercoxit Asteroid']).toEqual(['Mercoxit']);
  });
});
