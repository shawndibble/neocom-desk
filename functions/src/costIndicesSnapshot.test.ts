import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  COST_INDICES_MAX_DAYS,
  costIndicesR2Key,
  mergeSystemCostIndices,
  parseCostIndices,
  writeCostIndicesToR2,
} from './costIndicesSnapshot.js';

const ESI = [
  {
    solar_system_id: 30000142,
    cost_indices: [
      { activity: 'manufacturing', cost_index: 0.05 },
      { activity: 'reaction', cost_index: 0.02 },
    ],
  },
  { solar_system_id: 30002187, cost_indices: [{ activity: 'copying', cost_index: 0.01 }] },
];

function fakeR2(stored: Record<string, unknown> = {}) {
  const puts: Array<{ key: string; json: unknown; headers: Record<string, string> }> = [];
  const get = async (key: string) => (key in stored ? stored[key] : null);
  const put = async (key: string, body: Buffer | string, headers: Record<string, string>) => {
    const raw = typeof body === 'string' ? body : gunzipSync(body).toString('utf8');
    puts.push({ key, json: JSON.parse(raw), headers });
  };
  return { get, put, puts };
}

describe('parseCostIndices', () => {
  it('reads every system and activity', () => {
    expect(parseCostIndices(ESI)).toEqual({
      30000142: { manufacturing: 0.05, reaction: 0.02 },
      30002187: { copying: 0.01 },
    });
  });

  it('skips malformed entries without throwing', () => {
    expect(parseCostIndices(null)).toEqual({});
    expect(
      parseCostIndices([
        { solar_system_id: 'x', cost_indices: [] },
        { solar_system_id: 1, cost_indices: [{ activity: 'copying', cost_index: 'no' }, 7] },
        { solar_system_id: 2, cost_indices: [{ activity: 'copying', cost_index: 0.1 }] },
      ])
    ).toEqual({ 2: { copying: 0.1 } });
  });
});

describe('mergeSystemCostIndices', () => {
  it('starts an object from nothing', () => {
    expect(
      mergeSystemCostIndices(1, null, [{ date: '2026-10-22', indices: { copying: 0.1 } }], 9)
    ).toEqual({
      systemId: 1,
      lastSyncedAt: 9,
      dates: ['2026-10-22'],
      activities: { copying: [0.1] },
    });
  });

  it('appends a day, padding a missing activity with null', () => {
    const first = mergeSystemCostIndices(
      1,
      null,
      [{ date: '2026-10-21', indices: { manufacturing: 0.05, reaction: 0.02 } }],
      1
    );
    const next = mergeSystemCostIndices(
      1,
      first,
      [{ date: '2026-10-22', indices: { manufacturing: 0.06, invention: 0.03 } }],
      2
    );
    expect(next).toEqual({
      systemId: 1,
      lastSyncedAt: 2,
      dates: ['2026-10-21', '2026-10-22'],
      activities: {
        invention: [null, 0.03],
        manufacturing: [0.05, 0.06],
        reaction: [0.02, null],
      },
    });
  });

  it('accepts several days at once in any order (backfill)', () => {
    const merged = mergeSystemCostIndices(
      1,
      null,
      [
        { date: '2026-10-22', indices: { copying: 0.3 } },
        { date: '2026-10-20', indices: { copying: 0.1 } },
      ],
      1
    );
    expect(merged.dates).toEqual(['2026-10-20', '2026-10-22']);
    expect(merged.activities.copying).toEqual([0.1, 0.3]);
  });

  it('replaces a re-run day instead of duplicating it', () => {
    const first = mergeSystemCostIndices(
      1,
      null,
      [{ date: '2026-10-22', indices: { copying: 0.1 } }],
      1
    );
    const rerun = mergeSystemCostIndices(
      1,
      first,
      [{ date: '2026-10-22', indices: { copying: 0.2 } }],
      2
    );
    expect(rerun.dates).toEqual(['2026-10-22']);
    expect(rerun.activities).toEqual({ copying: [0.2] });
  });

  it('prunes the oldest days past the window', () => {
    const days = COST_INDICES_MAX_DAYS;
    const dates = Array.from({ length: days }, (_, i) => `d${String(i).padStart(3, '0')}`);
    const stored = {
      systemId: 1,
      lastSyncedAt: 0,
      dates,
      activities: {
        copying: dates.map((_, i) => i),
        reaction: dates.map((_, i) => (i === 0 ? 0.9 : null)),
      },
    };
    const next = mergeSystemCostIndices(
      1,
      stored,
      [{ date: 'z-today', indices: { copying: 5 } }],
      1
    );
    expect(next.dates).toHaveLength(days);
    expect(next.dates[0]).toBe('d001');
    expect(next.dates.at(-1)).toBe('z-today');
    expect(next.activities.copying.slice(-2)).toEqual([days - 1, 5]);
    expect(next.activities.reaction).toBeUndefined();
  });

  it('keeps at least 90 days', () => {
    expect(COST_INDICES_MAX_DAYS).toBeGreaterThanOrEqual(90);
  });

  it('restarts from a corrupt stored object', () => {
    const merged = mergeSystemCostIndices(
      1,
      { nope: true },
      [{ date: '2026-10-22', indices: { copying: 0.1 } }],
      1
    );
    expect(merged.dates).toEqual(['2026-10-22']);
  });
});

describe('writeCostIndicesToR2', () => {
  it('writes one gzip object per system, merged into what is stored', async () => {
    const { get, put, puts } = fakeR2({
      [costIndicesR2Key(30000142)]: {
        systemId: 30000142,
        lastSyncedAt: 1,
        dates: ['2026-10-21'],
        activities: { manufacturing: [0.04] },
      },
    });
    const result = await writeCostIndicesToR2(
      [{ date: '2026-10-22', indices: parseCostIndices(ESI) }],
      { get, put },
      7
    );
    expect(result).toEqual({ written: 2, failed: 0, firstError: null });
    const byKey = Object.fromEntries(puts.map((p) => [p.key, p]));
    expect(byKey['cost-indices/30000142.json'].json).toEqual({
      systemId: 30000142,
      lastSyncedAt: 7,
      dates: ['2026-10-21', '2026-10-22'],
      activities: { manufacturing: [0.04, 0.05], reaction: [null, 0.02] },
    });
    expect(byKey['cost-indices/30002187.json'].json).toMatchObject({ dates: ['2026-10-22'] });
    expect(byKey['cost-indices/30000142.json'].headers['Content-Encoding']).toBe('gzip');
    expect(byKey['cost-indices/30000142.json'].headers['Cache-Control']).toBe(
      'public, max-age=3600'
    );
  });

  it('counts a failing system instead of throwing', async () => {
    const { get, puts } = fakeR2();
    const result = await writeCostIndicesToR2(
      [{ date: '2026-10-22', indices: parseCostIndices(ESI) }],
      {
        get,
        put: async (key) => {
          if (key.includes('30002187')) throw new Error('boom');
          puts.push({ key, json: null, headers: {} });
        },
      },
      1
    );
    expect(result).toEqual({ written: 1, failed: 1, firstError: 'Error: boom' });
  });
});
