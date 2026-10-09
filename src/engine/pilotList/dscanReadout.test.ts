import { describe, expect, it } from 'vitest';
import { buildReadout, type Readout } from './dscanReadout';
import type { DscanTypeInfo } from './dscanRoles';
import type { DscanRow } from './parsePilotPaste';

const SHIP = 6;
// typeId -> [name, groupId, categoryId]
const TYPES: Record<number, [string, number, number]> = {
  1: ['Drake Navy Issue', 419, SHIP],
  2: ['Scimitar', 832, SHIP],
  3: ['Sabre', 541, SHIP],
  4: ['Huginn', 906, SHIP],
  5: ['Cheetah', 830, SHIP],
  6: ['Malediction', 831, SHIP],
  7: ['Mackinaw', 543, SHIP],
  8: ['Orca', 941, SHIP],
  9: ['Merlin', 25, SHIP],
  10: ['Raven', 27, SHIP],
  11: ['Redeemer', 898, SHIP],
  12: ['Revelation', 485, SHIP],
  13: ['Combat Scanner Probe I', 479, 8],
  14: ['Cynosural Field', 1, 2],
  15: ['Mobile Warp Disruptor I', 361, 22],
  16: ['Catalyst', 420, SHIP],
  17: ['Itty Bitty', 28, SHIP],
  18: ['Vexor', 26, SHIP],
};
const infoOf = (typeId: number): DscanTypeInfo | undefined => {
  const t = TYPES[typeId];
  return t === undefined ? undefined : { groupId: t[1], categoryId: t[2] };
};
const nameOf = (typeId: number) => TYPES[typeId]?.[0] ?? `#${typeId}`;

/** `n` rows of one type, spread evenly between `lo` and `hi` km. */
const rows = (typeId: number, n: number, lo = 10, hi = lo, name = ''): DscanRow[] =>
  Array.from({ length: n }, (_, i) => ({
    typeId,
    name,
    typeName: TYPES[typeId][0],
    distanceKm: lo + ((hi - lo) * i) / Math.max(1, n - 1),
  }));
const read = (...parts: DscanRow[][]): Readout => {
  const out = buildReadout(parts.flat(), infoOf, nameOf);
  if (out === null) throw new Error('expected a read-out');
  return out;
};

describe('buildReadout: readings', () => {
  it('reads nothing from a scan without ships', () => {
    expect(buildReadout(rows(13, 4, 6_000_000), infoOf, nameOf)).toBeNull();
  });

  it('Capital drop staging: a cyno field on scan', () => {
    const r = read(rows(14, 1), rows(18, 2));
    expect(r.reading).toBe('drop');
  });

  it('Capital drop staging: a capital together with a Black Ops', () => {
    const r = read(rows(12, 2, 18, 25), rows(11, 1));
    expect(r.reading).toBe('drop');
  });

  it('a capital alone, or a Black Ops alone, is not a drop', () => {
    expect(read(rows(12, 1), rows(18, 2)).reading).not.toBe('drop');
    expect(read(rows(11, 1), rows(18, 2)).reading).not.toBe('drop');
  });

  it('Scouts: three ships or fewer, each fast, covert or recon', () => {
    const r = read(rows(5, 1), rows(6, 1), rows(13, 8, 3_000_000, 12_000_000));
    expect(r.reading).toBe('scout');
    expect(r.evidence.map((e) => e.key)).toEqual(['ev.scouts', 'ev.probes']);
  });

  it('a Battleship among the scouts is no scout', () => {
    expect(read(rows(6, 1), rows(4, 1), rows(10, 1)).reading).not.toBe('scout');
    expect(read(rows(6, 1), rows(4, 1)).reading).toBe('scout');
  });

  it('four fast ships are no longer scouts', () => {
    expect(read(rows(9, 4)).reading).not.toBe('scout');
  });

  it('Mining fleet: miners and boosters at least half, combat 15% or less', () => {
    const r = read(rows(7, 11, 8, 61), rows(8, 2, 5, 9), rows(9, 1, 70));
    expect(r.reading).toBe('mining');
    expect(r.evidence.map((e) => e.key)).toEqual(['ev.miners', 'ev.boosters', 'ev.fewCombat']);
  });

  it('counts a booster once toward the mining share', () => {
    // 3 of 7 are miners or boosters: under half, however many are Orcas.
    expect(read(rows(8, 2), rows(7, 1), rows(1, 4)).reading).not.toBe('mining');
  });

  it('is not a mining fleet when combat ships are over 15%', () => {
    expect(read(rows(7, 4), rows(1, 1)).reading).not.toBe('mining');
  });

  it('Roaming PvP gang: 5+ combat ships and one hull at least half the damage ships', () => {
    const r = read(rows(1, 8, 38, 90), rows(2, 2, 40, 80));
    expect(r.reading).toBe('gang');
    expect(r.evidence[0]).toEqual({
      key: 'ev.doctrine',
      params: { count: 8, hull: 'Drake Navy Issue', percent: 100 },
    });
  });

  it('Roaming PvP gang: 5+ combat ships all within 25 km, with no single doctrine', () => {
    const r = read(rows(1, 2, 40, 45), rows(10, 2, 41, 50), rows(18, 2, 42, 55), rows(3, 1, 44));
    expect(r.reading).toBe('gang');
    expect(r.evidence.map((e) => e.key)).toEqual(['ev.together', 'ev.tackle']);
  });

  it('is not a gang when spread out and without a doctrine', () => {
    const r = read(
      rows(1, 1, 10),
      rows(10, 1, 60),
      rows(18, 1, 110),
      rows(16, 1, 140),
      rows(2, 1, 30)
    );
    expect(r.reading).toBe('mixed');
  });

  it('is not a gang when a ship has no distance to measure the spread by', () => {
    const noKm = rows(1, 1).map((x) => ({ ...x, distanceKm: null }));
    const r = read(noKm, rows(10, 1, 60), rows(18, 1, 110), rows(16, 1, 140), rows(2, 1, 30));
    expect(r.reading).toBe('mixed');
  });

  it('Mixed traffic: none of the above, with the hull count and spread as evidence', () => {
    const r = read(rows(18, 1, 4), rows(10, 1, 33), rows(17, 1, 90), rows(16, 1, 121));
    expect(r.reading).toBe('mixed');
    expect(r.evidence).toEqual([
      { key: 'ev.hulls', params: { count: 4, hulls: 4 } },
      { key: 'ev.spread', params: { distance: '117 km' } },
    ]);
  });

  it('prints a mixed scan spread of 2,000 km grouped, not raw', () => {
    const r = read(rows(18, 1, 4), rows(10, 1, 33), rows(17, 1, 90), rows(16, 1, 2004));
    const spread = r.evidence.find((e) => e.key === 'ev.spread');
    expect(spread?.params.distance).toBe(`${(2000).toLocaleString()} km`);
  });

  it('prints a spread of about 9 AU in AU with no long digit run', () => {
    const nineAu = 9 * 149_597_870.7;
    const r = read(rows(18, 1, 4), rows(10, 1, 33), rows(17, 1, 90), rows(16, 1, nineAu + 4));
    const spread = r.evidence.find((e) => e.key === 'ev.spread');
    expect(spread?.params.distance).toBe('9.0 AU');
    expect(String(spread?.params.distance)).not.toMatch(/\d{7,}/);
  });
});
