import { describe, it, expect } from 'vitest';
import { attributePairBandStarts } from './attributePairBands';
import { buildRows } from './markers';
import type { EngineSkill, PlanEntry } from '@/engine/types';

const entry = (skillTypeID: number, targetLevel = 1): PlanEntry => ({ skillTypeID, targetLevel });

function skill(
  typeID: number,
  primary: EngineSkill['primary'],
  secondary: EngineSkill['secondary']
): EngineSkill {
  return { typeID, name: `Skill ${typeID}`, rank: 1, primary, secondary, prereqs: [] };
}

const catalog = (skills: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(skills.map((s) => [s.typeID, s]));

describe('attributePairBandStarts', () => {
  it('is empty for no rows', () => {
    expect(attributePairBandStarts(buildRows([], undefined), new Map())).toEqual(new Map());
  });

  it('the first entry row always starts a band', () => {
    const rows = buildRows([entry(1)], undefined);
    const result = attributePairBandStarts(rows, catalog([skill(1, 'perception', 'willpower')]));
    expect(result).toEqual(
      new Map([[rows[0].id, { primary: 'perception', secondary: 'willpower' }]])
    );
  });

  it('consecutive entries with the same attribute pair do not start a new band', () => {
    const rows = buildRows([entry(1), entry(2)], undefined);
    const result = attributePairBandStarts(
      rows,
      catalog([skill(1, 'perception', 'willpower'), skill(2, 'perception', 'willpower')])
    );
    expect(result.size).toBe(1);
    expect(result.get(rows[0].id)).toEqual({ primary: 'perception', secondary: 'willpower' });
  });

  it('an attribute pair change starts a new band', () => {
    const rows = buildRows([entry(1), entry(2), entry(3)], undefined);
    const result = attributePairBandStarts(
      rows,
      catalog([
        skill(1, 'perception', 'willpower'),
        skill(2, 'perception', 'willpower'),
        skill(3, 'intelligence', 'memory'),
      ])
    );
    expect([...result.entries()]).toEqual([
      [rows[0].id, { primary: 'perception', secondary: 'willpower' }],
      [rows[2].id, { primary: 'intelligence', secondary: 'memory' }],
    ]);
  });

  it('swapped primary/secondary counts as a different pair', () => {
    const rows = buildRows([entry(1), entry(2)], undefined);
    const result = attributePairBandStarts(
      rows,
      catalog([skill(1, 'perception', 'willpower'), skill(2, 'willpower', 'perception')])
    );
    expect(result.size).toBe(2);
  });

  it('an entry unknown to the catalog does not start a band and does not reset the comparison', () => {
    const rows = buildRows([entry(1), entry(2), entry(3)], undefined);
    const result = attributePairBandStarts(
      rows,
      catalog([skill(1, 'perception', 'willpower'), skill(3, 'perception', 'willpower')])
    ); // skill 2 missing from catalog
    expect(result.size).toBe(1);
    expect(result.has(rows[1].id)).toBe(false);
  });

  it('a marker row does not start a band and does not reset the comparison', () => {
    const rows = buildRows([entry(1), entry(2)], [1]); // marker between entry 1 and 2
    const markerRow = rows.find((r) => r.kind === 'marker')!;
    const result = attributePairBandStarts(
      rows,
      catalog([skill(1, 'perception', 'willpower'), skill(2, 'perception', 'willpower')])
    );
    expect(result.has(markerRow.id)).toBe(false);
    expect(result.size).toBe(1);
  });
});
