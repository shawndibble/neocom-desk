import { describe, expect, it } from 'vitest';
import { buildIncursionRows, nearestIncursion, type IncursionEntry } from './incursionRows';

const entry = (over: Partial<IncursionEntry> & { constellation_id: number }): IncursionEntry => ({
  staging_solar_system_id: over.constellation_id + 1000,
  state: 'established',
  influence: 0.5,
  has_boss: false,
  faction_id: 500019,
  type: 'Incursion',
  infested_solar_systems: [1, 2, 3],
  ...over,
});

describe('buildIncursionRows', () => {
  it('shapes each incursion with its jumps from the staging system', () => {
    const [row] = buildIncursionRows(
      [entry({ constellation_id: 1, influence: 0.25, has_boss: true })],
      new Map([[1001, 4]])
    );
    expect(row).toEqual({
      constellationId: 1,
      stagingSystemId: 1001,
      state: 'established',
      influence: 0.25,
      hasBoss: true,
      systemCount: 3,
      jumps: 4,
    });
  });

  it('sorts nearest first, and puts a staging system with no route last, never as 0', () => {
    const rows = buildIncursionRows(
      [
        entry({ constellation_id: 1 }),
        entry({ constellation_id: 2 }),
        entry({ constellation_id: 3 }),
      ],
      new Map([
        [1001, 9],
        [1003, 2],
      ])
    );
    expect(rows.map((r) => [r.constellationId, r.jumps])).toEqual([
      [3, 2],
      [1, 9],
      [2, null],
    ]);
  });

  it('with no distances at all, keeps every jump unknown and orders by influence, highest first', () => {
    const rows = buildIncursionRows(
      [
        entry({ constellation_id: 1, influence: 0.2 }),
        entry({ constellation_id: 2, influence: 0.9 }),
      ],
      null
    );
    expect(rows.map((r) => [r.constellationId, r.jumps])).toEqual([
      [2, null],
      [1, null],
    ]);
  });

  it('clamps influence to 0..1 and drops an entry with a state it does not know', () => {
    const rows = buildIncursionRows(
      [
        entry({ constellation_id: 1, influence: 1.4 }),
        entry({ constellation_id: 2, state: 'invading' as never }),
      ],
      null
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].influence).toBe(1);
  });
});

describe('nearestIncursion', () => {
  it('is the first row, when its distance is known', () => {
    const rows = buildIncursionRows(
      [entry({ constellation_id: 1 }), entry({ constellation_id: 2 })],
      new Map([
        [1001, 9],
        [1002, 4],
      ])
    );
    expect(nearestIncursion(rows)?.constellationId).toBe(2);
  });

  it('is none when no distance is known, so an unreachable staging system is never "nearest"', () => {
    const rows = buildIncursionRows([entry({ constellation_id: 1 })], null);
    expect(nearestIncursion(rows)).toBeNull();
  });

  it('is none for an empty list', () => {
    expect(nearestIncursion([])).toBeNull();
  });
});
