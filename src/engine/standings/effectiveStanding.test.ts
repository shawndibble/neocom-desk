import { describe, it, expect } from 'vitest';
import {
  ESI_STANDINGS_ARE_BASE,
  NO_SOCIAL_SKILLS,
  effectiveStanding,
  standingsFromEsi,
  type SocialSkillLevels,
} from './effectiveStanding';

const skills = (connections: number, criminalConnections: number, diplomacy: number) =>
  ({ connections, criminalConnections, diplomacy }) satisfies SocialSkillLevels;

describe('effectiveStanding', () => {
  it.each([
    // [base, criminal, skills, expected, why]
    [5, false, skills(0, 0, 0), 5, 'no skills change nothing'],
    [5, false, skills(5, 0, 0), 6, 'Connections V: 5 + 5 * 0.2'],
    [0.9, false, skills(2, 0, 0), 1.628, 'Connections II on 0.9 (EVE Uni worked example)'],
    [10, false, skills(5, 5, 5), 10, 'the cap stays 10'],
    [5, true, skills(5, 0, 0), 5, 'a criminal entity ignores Connections'],
    [5, true, skills(0, 5, 0), 6, 'a criminal entity uses Criminal Connections'],
    [5, false, skills(0, 5, 0), 5, 'a lawful entity ignores Criminal Connections'],
    [-3, false, skills(5, 5, 5), -0.4, 'Diplomacy V on -3: -3 + 13 * 0.2'],
    [-3, true, skills(0, 0, 5), -0.4, 'Diplomacy applies to a criminal entity too'],
    [-3, false, skills(5, 5, 0), -3, 'Connections never lift a negative standing'],
    [0, false, skills(5, 5, 5), 0, 'exactly 0 stays 0'],
    [0, true, skills(5, 5, 5), 0, 'exactly 0 stays 0, criminal too'],
    [-10, false, skills(0, 0, 5), -6, 'Diplomacy V on -10: -10 + 20 * 0.2'],
  ])('base %s, criminal %s, %j -> %s (%s)', (base, criminal, levels, expected) => {
    expect(effectiveStanding(base, criminal, levels)).toBeCloseTo(expected, 10);
  });

  it('is the identity with NO_SOCIAL_SKILLS', () => {
    expect(effectiveStanding(3.3, false, NO_SOCIAL_SKILLS)).toBe(3.3);
    expect(effectiveStanding(-3.3, true, NO_SOCIAL_SKILLS)).toBe(-3.3);
  });
});

describe('standingsFromEsi', () => {
  it('assumes ESI returns base standings (UNVERIFIED, flip ESI_STANDINGS_ARE_BASE if it does not)', () => {
    expect(ESI_STANDINGS_ARE_BASE).toBe(true);
  });

  it('with ESI as base: keeps the number and applies the skills', () => {
    expect(standingsFromEsi(5, false, skills(5, 0, 0), true)).toEqual({ base: 5, effective: 6 });
  });

  it('defaults to the ESI_STANDINGS_ARE_BASE assumption', () => {
    expect(standingsFromEsi(5, false, skills(5, 0, 0))).toEqual({ base: 5, effective: 6 });
  });

  it.each([
    [6, false, skills(5, 0, 0), 5, 'Connections V undone'],
    [6, true, skills(0, 5, 0), 5, 'Criminal Connections V undone'],
    [-0.4, false, skills(0, 0, 5), -3, 'Diplomacy V undone'],
    [0, false, skills(5, 5, 5), 0, '0 is 0'],
    [4, false, skills(0, 0, 0), 4, 'no skills'],
  ])('with ESI as effective: %s -> base %s (%s)', (esi, criminal, levels, base) => {
    const result = standingsFromEsi(esi, criminal, levels, false);
    expect(result.effective).toBe(esi);
    expect(result.base).toBeCloseTo(base, 10);
  });
});
