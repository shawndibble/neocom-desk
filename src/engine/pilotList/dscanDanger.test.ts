import { describe, expect, it } from 'vitest';
import {
  BUSY_MIN_SHIPS,
  buildDangerRead,
  hullRankOf,
  killThresholdRank,
  ownShipRank,
  ROLE_BAR_PROMOTE_MIN,
  scanAge,
  SCAN_STALE_MS,
  WATCH_MAX_GROUPS,
  type DangerRead,
} from './dscanDanger';
import type { DscanTypeInfo } from './dscanRoles';
import type { DscanRow } from './parsePilotPaste';

const SHIP = 6;
// typeId -> [name, groupId, categoryId]
const TYPES: Record<number, [string, number, number]> = {
  1: ['Cenotaph', 419, SHIP], // battlecruiser, damage
  2: ['Bustard', 380, SHIP], // deep space transport
  3: ['Rapier', 833, SHIP], // force recon
  4: ['Catalyst', 420, SHIP], // destroyer, damage
  5: ['Sabre', 541, SHIP], // interdictor
  6: ['Widow', 898, SHIP], // black ops
  7: ['Rifter', 25, SHIP], // frigate, damage
  8: ['Caracal', 26, SHIP], // cruiser, damage
  9: ['Raven', 27, SHIP], // battleship, damage
  10: ['Iteron V', 28, SHIP], // industrial
  11: ['Retriever', 463, SHIP], // mining barge
  12: ['Revelation', 485, SHIP], // dreadnought
  13: ['Combat Scanner Probe I', 479, 8],
  14: ['Cynosural Field', 1, 2],
  15: ['Scimitar', 832, SHIP], // logistics
  16: ['Drake', 419, SHIP],
  17: ['Atron', 25, SHIP],
  18: ['Capsule', 29, SHIP],
  19: ['Unmapped hull', 9999, SHIP], // a damage hull no size is pinned for
};
const infoOf = (typeId: number): DscanTypeInfo | undefined => {
  const t = TYPES[typeId];
  return t === undefined ? undefined : { groupId: t[1], categoryId: t[2] };
};
const nameOf = (typeId: number) => TYPES[typeId]?.[0] ?? `#${typeId}`;
const rows = (typeId: number, n: number, km = 10): DscanRow[] =>
  Array.from({ length: n }, () => ({
    typeId,
    name: '',
    typeName: TYPES[typeId][0],
    distanceKm: km,
  }));

const HURRICANE_GROUP = 419;
const read = (
  parts: DscanRow[][],
  opts: {
    ownShipGroupId?: number | null;
    previous?: { typeId: number; count: number }[] | null;
  } = {}
): DangerRead => {
  const out = buildDangerRead(parts.flat(), infoOf, nameOf, {
    ownShipGroupId: opts.ownShipGroupId === undefined ? HURRICANE_GROUP : opts.ownShipGroupId,
    previous: opts.previous ?? null,
  });
  if (out === null) throw new Error('expected a read');
  return out;
};

describe('hull ranks and the kill threshold', () => {
  it('ranks hulls by size, frigate to capital', () => {
    expect(hullRankOf(25)).toBe(1);
    expect(hullRankOf(420)).toBe(2);
    expect(hullRankOf(26)).toBe(3);
    expect(hullRankOf(419)).toBe(4);
    expect(hullRankOf(27)).toBe(5);
    expect(hullRankOf(485)).toBe(6);
    expect(hullRankOf(9999)).toBeNull();
  });

  it('treats industrial and transport hulls as the most fragile, whatever their size', () => {
    expect(ownShipRank(28)).toBe(1);
    expect(ownShipRank(463)).toBe(1);
    expect(ownShipRank(380)).toBe(1);
    expect(ownShipRank(419)).toBe(4);
    expect(ownShipRank(null)).toBeNull();
  });

  it('a damage ship threatens a hull one size smaller than itself or larger; small hulls fear anything', () => {
    expect(killThresholdRank(4)).toBe(3); // Hurricane: cruiser and up
    expect(killThresholdRank(1)).toBe(1); // hauler: any damage ship
    expect(killThresholdRank(2)).toBe(1);
    expect(killThresholdRank(5)).toBe(4);
    expect(killThresholdRank(null)).toBe(3); // unknown ship: the old cruiser-and-up rule
  });
});

describe('buildDangerRead: level and counts', () => {
  it('reads nothing from a scan without ships', () => {
    expect(
      buildDangerRead(rows(13, 3, 6_000_000), infoOf, nameOf, {
        ownShipGroupId: null,
        previous: null,
      })
    ).toBeNull();
  });

  it('the 4-ship mixed scan: Watch, one can hurt a battlecruiser and one can find', () => {
    const r = read([rows(1, 1), rows(2, 1, 11), rows(3, 1), rows(4, 1)]);
    expect(r.level).toBe('watch');
    expect(r.counts).toEqual({ kill: 1, catch: 0, find: 1, more: 0 });
    expect(r.headline.map((c) => [c.kind, c.count])).toEqual([
      ['kill', 1],
      ['find', 1],
    ]);
  });

  it('the same scan reads wider for a hauler: the Catalyst can hurt it too', () => {
    const r = read([rows(1, 1), rows(2, 1), rows(3, 1), rows(4, 1)], { ownShipGroupId: 28 });
    expect(r.counts.kill).toBe(2);
  });

  it('with no ship known it falls back to cruiser and up and says the ship is unknown', () => {
    const r = read([rows(1, 1), rows(4, 1), rows(7, 2)], { ownShipGroupId: null });
    expect(r.counts.kill).toBe(1);
    expect(r.ownShipKnown).toBe(false);
  });

  it('hauling traffic is Clear with nothing to watch', () => {
    const r = read([rows(10, 5), rows(2, 1)]);
    expect(r.level).toBe('clear');
    expect(r.watch).toEqual([]);
    expect(r.headline).toEqual([]);
  });

  it('counts a damage hull with no pinned size as a threat, not as harmless', () => {
    expect(read([rows(19, 2)]).counts.kill).toBe(2);
  });

  it('a pinning ship together with damage is Danger', () => {
    expect(read([rows(1, 1), rows(5, 1)]).level).toBe('danger');
  });

  it('a Black Ops with a damage ship is Danger, and counts as bringing more', () => {
    const r = read([rows(6, 1), rows(1, 1)]);
    expect(r.level).toBe('danger');
    expect(r.counts.more).toBe(1);
  });

  it('a cyno field on scan counts as bringing more', () => {
    const r = read([rows(14, 1), rows(1, 1)]);
    expect(r.counts.more).toBeGreaterThanOrEqual(1);
    expect(r.level).toBe('danger');
  });

  it('a lone recon is Watch, not Danger', () => {
    const r = read([rows(3, 1), rows(10, 2)]);
    expect(r.level).toBe('watch');
    expect(r.counts.find).toBe(1);
  });

  it('combat probes on scan count as someone finding you', () => {
    const r = read([rows(13, 2), rows(10, 1)]);
    expect(r.counts.find).toBe(2);
    expect(r.level).toBe('watch');
  });

  it('a big crowd with no doctrine is a Busy hub, with no danger level', () => {
    // Three damage hulls spread over 115 km: no doctrine, no tight gang.
    const crowd = [rows(7, 10, 5), rows(17, 10, 60), rows(8, 10, 120), rows(10, 10)];
    expect(crowd.flat().length).toBeGreaterThanOrEqual(BUSY_MIN_SHIPS);
    const r = read(crowd);
    expect(r.level).toBe('busy');
  });

  it('a big fleet with a doctrine is still Danger, not Busy', () => {
    const r = read([rows(1, 30), rows(5, 1)]);
    expect(r.level).toBe('danger');
  });
});

describe('buildDangerRead: the watch list', () => {
  it('groups identical hulls and ranks pinning, then bringing more, then damage, then scouts', () => {
    const r = read([rows(3, 2), rows(1, 4), rows(5, 1), rows(6, 1)]);
    expect(r.watch.map((g) => [g.typeId, g.count, g.kind])).toEqual([
      [5, 1, 'catch'],
      [6, 1, 'more'],
      [1, 4, 'kill'],
      [3, 2, 'find'],
    ]);
  });

  it('caps the list and counts the groups left out; the rest are not threats', () => {
    const many = [
      rows(1, 9),
      rows(16, 8),
      rows(8, 7),
      rows(9, 6),
      rows(5, 5),
      rows(3, 4),
      rows(10, 3),
    ];
    const r = read(many);
    expect(r.watch).toHaveLength(WATCH_MAX_GROUPS);
    expect(r.moreGroups).toBe(1);
    expect(r.notThreat).toEqual({ groups: 1, ships: 3, typeIds: [10] });
  });

  it('breaks ties deterministically: larger group first, then type id', () => {
    const r = read([rows(16, 2), rows(1, 2)]);
    expect(r.watch.map((g) => g.typeId)).toEqual([1, 16]);
  });

  it('marks how many of a group are new since the earlier scan, or null on a first scan', () => {
    const parts = [rows(1, 3), rows(3, 1)];
    expect(read(parts).watch.every((g) => g.newCount === null)).toBe(true);
    const r = read(parts, {
      previous: [
        { typeId: 1, count: 1 },
        { typeId: 3, count: 1 },
      ],
    });
    expect(r.watch.find((g) => g.typeId === 1)?.newCount).toBe(2);
    expect(r.watch.find((g) => g.typeId === 3)?.newCount).toBe(0);
  });
});

describe('scanAge', () => {
  it('is fresh for the first two minutes, then stale', () => {
    expect(scanAge(0)).toEqual({ stale: false, unit: 'seconds', value: 5 });
    expect(scanAge(20_000)).toEqual({ stale: false, unit: 'seconds', value: 20 });
    expect(scanAge(119_000)).toEqual({ stale: false, unit: 'seconds', value: 119 });
    expect(scanAge(SCAN_STALE_MS)).toEqual({ stale: true, unit: 'minutes', value: 2 });
    expect(scanAge(5 * 60_000 + 10_000)).toEqual({ stale: true, unit: 'minutes', value: 5 });
  });
});

describe('buildDangerRead: tripwires, pattern, role bar', () => {
  it('has four tripwires with live counts and tones', () => {
    const r = read([rows(1, 3), rows(5, 1), rows(3, 1)]);
    expect(r.tripwires).toEqual([
      { kind: 'catch', count: 1, tone: 'bad' },
      { kind: 'more', count: 0, tone: 'none' },
      { kind: 'kill', count: 3, tone: 'bad' },
      { kind: 'find', count: 1, tone: 'warn' },
    ]);
  });

  it('reports no pattern for mixed traffic and a pattern for a doctrine fleet', () => {
    expect(read([rows(1, 1), rows(2, 1), rows(3, 1), rows(4, 1)]).pattern).toBeNull();
    const fleet = read([rows(1, 12), rows(15, 2), rows(5, 2)]);
    expect(fleet.pattern?.reading).toBe('gang');
  });

  it('promotes the role bar once the scan is big enough', () => {
    expect(read([rows(1, ROLE_BAR_PROMOTE_MIN - 1)]).promoteRoles).toBe(false);
    expect(read([rows(1, ROLE_BAR_PROMOTE_MIN)]).promoteRoles).toBe(true);
  });

  it('counts total ships, leaving out capsules', () => {
    expect(read([rows(1, 2), rows(18, 5)]).totalShips).toBe(2);
  });
});
