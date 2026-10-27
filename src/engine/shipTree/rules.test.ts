import { describe, expect, it } from 'vitest';
import type { ShipTreeGroup } from '@/sde/types';
import { classNeedsOmega, classUnlocked, parentEmpires, tileTone } from './rules';

const CALDARI = 500001;
const GALLENTE = 500004;
const GURISTAS = 500010;
const ORE = 500014;

const SKILL_NAMES: Record<number, string> = {
  1: 'Caldari Frigate',
  2: 'Gallente Frigate',
  3: 'Interceptors',
  4: 'Caldari Cruiser',
};
const skillName = (id: number) => SKILL_NAMES[id];

function group(prereqsByFaction: ShipTreeGroup['prereqsByFaction']): ShipTreeGroup {
  return { id: 10, name: 'Interceptor', description: '', icon: '', prereqsByFaction };
}

const INTERCEPTOR = group({
  [CALDARI]: [
    { skillTypeID: 1, level: 5, display: true },
    { skillTypeID: 3, level: 1, display: false },
  ],
  [GURISTAS]: [
    { skillTypeID: 2, level: 3, display: true },
    { skillTypeID: 1, level: 3, display: true },
    { skillTypeID: 3, level: 1, display: true },
  ],
});

describe('classUnlocked', () => {
  it('needs every prereq for the faction, displayed or not', () => {
    const levels = new Map([
      [1, 5],
      [3, 0],
    ]);
    const trained = (id: number) => levels.get(id) ?? 0;
    expect(classUnlocked(INTERCEPTOR, CALDARI, trained)).toBe(false);
    levels.set(3, 1);
    expect(classUnlocked(INTERCEPTOR, CALDARI, trained)).toBe(true);
  });

  it('reads the prereqs of the faction asked for', () => {
    const trained = (id: number) => (id === 1 ? 5 : id === 3 ? 1 : 0);
    expect(classUnlocked(INTERCEPTOR, GURISTAS, trained)).toBe(false);
  });

  it('is unlocked when the class has no prereqs (or is unknown)', () => {
    expect(classUnlocked(undefined, CALDARI, () => 0)).toBe(true);
    expect(classUnlocked(group({}), CALDARI, () => 0)).toBe(true);
  });
});

describe('classNeedsOmega', () => {
  it('is true when any prereq, displayed or not, is above its Alpha cap', () => {
    // Caldari Frigate caps at IV for Alphas; the hidden Interceptors skill is Omega-only.
    const cap = (id: number) => (id === 1 ? 4 : id === 3 ? 0 : 0);
    expect(classNeedsOmega(INTERCEPTOR, CALDARI, cap)).toBe(true);
    const lenient = (id: number) => (id === 1 ? 5 : id === 3 ? 1 : 0);
    expect(classNeedsOmega(INTERCEPTOR, CALDARI, lenient)).toBe(false);
  });

  it('is false for an unknown class', () => {
    expect(classNeedsOmega(undefined, CALDARI, () => 0)).toBe(false);
  });
});

describe('parentEmpires', () => {
  it('names the two empires whose skills a pirate class uses, [bottom, top] = descending id', () => {
    expect(parentEmpires(INTERCEPTOR, GURISTAS, skillName)).toEqual([GALLENTE, CALDARI]);
  });

  it('is empty for empires and ORE', () => {
    expect(parentEmpires(INTERCEPTOR, CALDARI, skillName)).toEqual([]);
    const ore = group({ [ORE]: INTERCEPTOR.prereqsByFaction[GURISTAS]! });
    expect(parentEmpires(ore, ORE, skillName)).toEqual([]);
  });

  it('ignores hidden prereqs and de-duplicates the same empire', () => {
    const g = group({
      [GURISTAS]: [
        { skillTypeID: 1, level: 3, display: true },
        { skillTypeID: 4, level: 3, display: true },
        { skillTypeID: 2, level: 3, display: false },
      ],
    });
    // Only Caldari is displayed — one empire is not a pair.
    expect(parentEmpires(g, GURISTAS, skillName)).toEqual([]);
  });

  it('is empty for an unknown class', () => {
    expect(parentEmpires(undefined, GURISTAS, skillName)).toEqual([]);
  });
});

describe('tileTone', () => {
  it('is elite only at Mastery V', () => {
    expect(tileTone({ canFly: true, secondsToFly: 0, mastery: 5 })).toBe('elite');
    expect(tileTone({ canFly: true, secondsToFly: 0, mastery: 4 })).toBe('canFly');
    expect(tileTone({ canFly: true, secondsToFly: 0, mastery: 0 })).toBe('canFly');
  });

  it('is locked when the hull cannot be flown or has no status', () => {
    expect(tileTone({ canFly: false, secondsToFly: 60, mastery: 0 })).toBe('locked');
    expect(tileTone(undefined)).toBe('locked');
  });
});
