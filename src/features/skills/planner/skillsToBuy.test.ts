import { describe, expect, it } from 'vitest';
import { buildSkillsToBuy, skillsToBuyTypeIds } from './skillsToBuy';

const name = (id: number) => `Skill ${id}`;

describe('skillsToBuyTypeIds', () => {
  it('dedupes across levels and drops owned skills', () => {
    const owned = new Map([[2, {}]]);
    const ids = skillsToBuyTypeIds(
      [{ skillTypeID: 1 }, { skillTypeID: 1 }, { skillTypeID: 2 }],
      owned
    );
    expect(ids).toEqual([1]);
  });
});

describe('buildSkillsToBuy', () => {
  it('totals priced rows, counts unpriced ones, prefers hub over region', () => {
    const facts = buildSkillsToBuy(
      [1, 2, 3],
      name,
      new Map([[1, 100]]),
      new Map([
        [2, 50],
        [1, 999],
      ])
    );
    expect(facts.rows).toEqual([
      { typeID: 1, name: 'Skill 1', price: 100, source: 'hub' },
      { typeID: 2, name: 'Skill 2', price: 50, source: 'region' },
      { typeID: 3, name: 'Skill 3', price: null, source: null },
    ]);
    expect(facts.total).toBe(150);
    expect(facts.unpricedCount).toBe(1);
    expect(facts.multibuy).toBe('Skill 1 1\nSkill 2 1\nSkill 3 1');
  });
});
