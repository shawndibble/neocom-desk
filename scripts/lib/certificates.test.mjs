import { describe, it, expect } from 'vitest';
import { bakeCertificates, COMBAT_CERTIFICATE_GROUP_IDS } from './certificates.mjs';

const SKILLS = new Set([3300, 3303, 3310, 3327]);
const GROUPS = [
  { _key: 255, name: { en: 'Gunnery' } },
  { _key: 275, name: { en: 'Navigation' } },
  { _key: 268, name: { en: 'Production' } },
];

function cert(overrides = {}) {
  return {
    _key: 50,
    groupID: 255,
    name: { en: 'Small Energy Turret', de: 'Kleine' },
    description: { en: 'Lasers.' },
    skillTypes: [{ _key: 3300, basic: 1, standard: 2, improved: 3, advanced: 4, elite: 5 }],
    ...overrides,
  };
}

describe('bakeCertificates', () => {
  it('maps the five named grades by name, never by key order', () => {
    // CCP's objects list the keys alphabetically: advanced, basic, elite, improved, standard.
    const [c] = bakeCertificates(
      [
        cert({
          skillTypes: [{ _key: 3300, advanced: 4, basic: 1, elite: 5, improved: 3, standard: 2 }],
        }),
      ],
      GROUPS,
      SKILLS
    );
    expect(c.levels).toEqual([
      [{ skillTypeID: 3300, level: 1 }],
      [{ skillTypeID: 3300, level: 2 }],
      [{ skillTypeID: 3300, level: 3 }],
      [{ skillTypeID: 3300, level: 4 }],
      [{ skillTypeID: 3300, level: 5 }],
    ]);
  });

  it('carries the English name, description and group name', () => {
    const [c] = bakeCertificates([cert()], GROUPS, SKILLS);
    expect(c).toMatchObject({
      id: 50,
      name: 'Small Energy Turret',
      description: 'Lasers.',
      groupId: 255,
      groupName: 'Gunnery',
    });
  });

  it('drops a level-0 requirement, which means "not needed at this grade"', () => {
    const [c] = bakeCertificates(
      [
        cert({
          skillTypes: [
            { _key: 3300, basic: 1, standard: 1, improved: 2, advanced: 3, elite: 4 },
            { _key: 3303, basic: 0, standard: 0, improved: 1, advanced: 1, elite: 2 },
          ],
        }),
      ],
      GROUPS,
      SKILLS
    );
    expect(c.levels[0]).toEqual([{ skillTypeID: 3300, level: 1 }]);
    expect(c.levels[2]).toEqual([
      { skillTypeID: 3300, level: 2 },
      { skillTypeID: 3303, level: 1 },
    ]);
  });

  it('drops a skill the skill catalog lacks', () => {
    const [c] = bakeCertificates(
      [
        cert({
          skillTypes: [
            { _key: 3300, basic: 1, standard: 2, improved: 3, advanced: 4, elite: 5 },
            { _key: 99999, basic: 1, standard: 2, improved: 3, advanced: 4, elite: 5 },
          ],
        }),
      ],
      GROUPS,
      SKILLS
    );
    expect(c.levels[4]).toEqual([{ skillTypeID: 3300, level: 5 }]);
  });

  it('keeps only the combat groups', () => {
    const certs = bakeCertificates(
      [
        cert({ _key: 1, groupID: 255 }),
        cert({ _key: 2, groupID: 268, name: { en: 'Tech I Manufacturing' } }),
      ],
      GROUPS,
      SKILLS
    );
    expect(certs.map((c) => c.id)).toEqual([1]);
    expect(COMBAT_CERTIFICATE_GROUP_IDS).toHaveLength(9);
  });

  it('sorts by group name, then certificate name', () => {
    const certs = bakeCertificates(
      [
        cert({ _key: 1, groupID: 275, name: { en: 'Navigation' } }),
        cert({ _key: 2, groupID: 255, name: { en: 'Small Hybrid Turret' } }),
        cert({ _key: 3, groupID: 255, name: { en: 'Medium Energy Turret' } }),
      ],
      GROUPS,
      SKILLS
    );
    expect(certs.map((c) => c.id)).toEqual([3, 2, 1]);
  });
});
