import { describe, expect, it } from 'vitest';
import {
  buildRouteSafetyRows,
  foldQuietStretches,
  indexSystemJumps,
  routeStripKeySystems,
  indexSystemKills,
  joinLegs,
  summarizeRouteSafety,
  summarizeTrip,
  type RouteSafetyInputs,
  type RouteSafetyRow,
} from './routeSafety';

const JITA = 30000142;
const PERIMETER = 30000144;
const UEDAMA = 30002768;
const AMAMAKE = 30002537;
const THERA = 31000005;

const SYSTEMS = new Map([
  [JITA, { id: JITA, name: 'Jita', security: 0.9459, regionId: 10000002 }],
  [PERIMETER, { id: PERIMETER, name: 'Perimeter', security: 0.95, regionId: 10000002 }],
  [UEDAMA, { id: UEDAMA, name: 'Uedama', security: 0.505, regionId: 10000033 }],
  [AMAMAKE, { id: AMAMAKE, name: 'Amamake', security: 0.33, regionId: 10000042 }],
  [THERA, { id: THERA, name: 'Thera', security: -0.99, regionId: 11000031 }],
]);

function inputs(overrides: Partial<RouteSafetyInputs> = {}): RouteSafetyInputs {
  return {
    systems: SYSTEMS,
    regionNames: new Map([
      [10000002, 'The Forge'],
      [10000033, 'The Citadel'],
    ]),
    kills: indexSystemKills([
      { system_id: JITA, ship_kills: 3, pod_kills: 1, npc_kills: 0 },
      { system_id: UEDAMA, ship_kills: 12, pod_kills: 4, npc_kills: 2 },
    ]),
    jumps: indexSystemJumps([
      { system_id: JITA, ship_jumps: 4200 },
      { system_id: UEDAMA, ship_jumps: 900 },
    ]),
    ...overrides,
  };
}

describe('buildRouteSafetyRows', () => {
  it('keeps the route order and joins each system to its snapshot entry', () => {
    const rows = buildRouteSafetyRows([JITA, PERIMETER, UEDAMA], inputs());
    expect(rows.map((row) => row.name)).toEqual(['Jita', 'Perimeter', 'Uedama']);
    expect(rows[0]).toMatchObject({
      systemId: JITA,
      security: 0.9,
      band: 'highsec',
      regionName: 'The Forge',
    });
  });

  it('flags only the listed lawless systems', () => {
    const rows = buildRouteSafetyRows(
      [JITA, PERIMETER, UEDAMA],
      inputs({ lawless: new Set([PERIMETER]) })
    );
    expect(rows.map((row) => row.lawless ?? false)).toEqual([false, true, false]);
  });

  it('flags nothing without a lawless list', () => {
    const rows = buildRouteSafetyRows([JITA, PERIMETER], inputs());
    expect(rows.every((row) => row.lawless === undefined)).toBe(true);
  });

  it('shows security as the game does, rounded to one decimal', () => {
    const [amamake] = buildRouteSafetyRows([AMAMAKE], inputs());
    expect(amamake.security).toBe(0.3);
    expect(amamake.band).toBe('lowsec');
  });

  it('reads the last hour of kills and jumps per system', () => {
    const [, , uedama] = buildRouteSafetyRows([JITA, PERIMETER, UEDAMA], inputs());
    expect(uedama).toMatchObject({ jumps: 900, shipKills: 12, podKills: 4, npcKills: 2 });
  });

  it('reads a system ESI left out of a good response as zero, since ESI lists only active systems', () => {
    const [, perimeter] = buildRouteSafetyRows([JITA, PERIMETER], inputs());
    expect(perimeter).toMatchObject({ jumps: 0, shipKills: 0, podKills: 0, npcKills: 0 });
  });

  it('reads a failed feed as unknown, never as zero', () => {
    const [jita] = buildRouteSafetyRows([JITA], inputs({ kills: null, jumps: null }));
    expect(jita).toMatchObject({ jumps: null, shipKills: null, podKills: null, npcKills: null });
  });

  it('reads wormhole space as unknown, because both feeds exclude it', () => {
    const [thera] = buildRouteSafetyRows([THERA], inputs());
    expect(thera).toMatchObject({ jumps: null, shipKills: null, podKills: null, npcKills: null });
  });

  it('leaves the region name empty when neither source can name it', () => {
    const [amamake] = buildRouteSafetyRows([AMAMAKE], inputs());
    expect(amamake.regionId).toBe(10000042);
    expect(amamake.regionName).toBeNull();
  });

  it('marks gank chokepoints and only those', () => {
    const rows = buildRouteSafetyRows([JITA, UEDAMA], inputs());
    expect(rows.map((row) => row.chokepoint)).toEqual([false, true]);
  });

  it('keeps a system the snapshot does not know as a row with nothing known about it', () => {
    const [row] = buildRouteSafetyRows([30099999], inputs());
    expect(row).toMatchObject({
      systemId: 30099999,
      name: null,
      security: null,
      band: null,
      regionId: null,
      regionName: null,
    });
  });
});

describe('summarizeRouteSafety', () => {
  it('counts jumps, systems per band, kills and chokepoints across the route', () => {
    const rows = buildRouteSafetyRows([JITA, PERIMETER, UEDAMA, AMAMAKE], inputs());
    expect(summarizeRouteSafety(rows)).toEqual({
      jumps: 3,
      highsec: 3,
      lowsec: 1,
      nullsec: 0,
      lowestSecurity: 0.3,
      shipKills: 15,
      podKills: 5,
      chokepoints: ['Uedama'],
    });
  });

  it('withholds a kill total when any system on the route is unknown', () => {
    const rows = buildRouteSafetyRows([JITA, THERA], inputs());
    const summary = summarizeRouteSafety(rows);
    expect(summary.shipKills).toBeNull();
    expect(summary.podKills).toBeNull();
  });
});

/** A hand-built row: zero kills, known security, not a chokepoint, unless overridden. */
function row(systemId: number, overrides: Partial<RouteSafetyRow> = {}): RouteSafetyRow {
  return {
    systemId,
    name: `S${systemId}`,
    security: 0.8,
    band: 'highsec',
    regionId: 10000002,
    regionName: 'The Forge',
    jumps: 10,
    shipKills: 0,
    podKills: 0,
    npcKills: 0,
    chokepoint: false,
    ...overrides,
  };
}

const noZkill = () => 0;

/** Each stretch as a short string: a system's id, or `quiet[a,b,c]`. */
function shape(stretches: ReturnType<typeof foldQuietStretches>): string[] {
  return stretches.map((stretch) =>
    stretch.kind === 'system'
      ? String(stretch.row.systemId)
      : `quiet[${stretch.rows.map((r) => r.systemId).join(',')}]`
  );
}

describe('foldQuietStretches', () => {
  it('never folds a pinned system, such as either end of a wormhole jump', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5), row(6)];
    expect(shape(foldQuietStretches(rows, noZkill, new Set([3, 4])))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(shape(foldQuietStretches(rows, noZkill, new Set([4])))).toEqual([
      '1',
      'quiet[2,3]',
      '4',
      '5',
      '6',
    ]);
  });

  it('folds a run of quiet middle systems, never either end', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', 'quiet[2,3,4]', '5']);
  });

  it('reports each run with its lowest security', () => {
    const rows = [row(1), row(2, { security: 0.6 }), row(3, { security: 0.5 }), row(4)];
    const [, run] = foldQuietStretches(rows, noZkill);
    expect(run).toMatchObject({ kind: 'quiet', lowestSecurity: 0.5 });
  });

  it('leaves a lone quiet system as its own row', () => {
    const rows = [row(1), row(2), row(3, { shipKills: 1 }), row(4), row(5)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('splits runs around a system with ship or pod kills', () => {
    const rows = [
      row(1),
      row(2),
      row(3),
      row(4, { podKills: 1 }),
      row(5),
      row(6),
      row(7, { shipKills: 2 }),
      row(8),
    ];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual([
      '1',
      'quiet[2,3]',
      '4',
      'quiet[5,6]',
      '7',
      '8',
    ]);
  });

  it('still folds a system with only NPC kills', () => {
    const rows = [row(1), row(2, { npcKills: 40 }), row(3), row(4)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', 'quiet[2,3]', '4']);
  });

  it('never folds a Gank Chokepoint', () => {
    const rows = [row(1), row(2), row(3, { chokepoint: true }), row(4), row(5)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('never folds a system with zKillboard kills', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const zkill = (systemId: number) => (systemId === 3 ? 1 : 0);
    expect(shape(foldQuietStretches(rows, zkill))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('treats an unknown ESI figure as unknown, never zero', () => {
    for (const unknown of [{ shipKills: null }, { podKills: null }] as const) {
      const rows = [row(1), row(2), row(3, unknown), row(4), row(5)];
      expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', '2', '3', '4', '5']);
    }
  });

  it('treats a zKillboard figure still loading or unavailable as unknown, never zero', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const zkill = (systemId: number) => (systemId === 3 ? null : 0);
    expect(shape(foldQuietStretches(rows, zkill))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('never folds a J-space system, even reported as zero', () => {
    const rows = [row(1), row(31000005), row(31000006), row(4)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', '31000005', '31000006', '4']);
  });

  it('never folds a system of unknown security', () => {
    const rows = [row(1), row(2), row(3, { security: null, band: null }), row(4), row(5)];
    expect(shape(foldQuietStretches(rows, noZkill))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('folds within whatever list it is given, so a leg folds between its own ends', () => {
    expect(shape(foldQuietStretches([row(1), row(2)], noZkill))).toEqual(['1', '2']);
    expect(shape(foldQuietStretches([], noZkill))).toEqual([]);
  });
});

describe('J-space in the facts', () => {
  it('leaves a wormhole system out of the band tallies and the lowest security', () => {
    const rows = buildRouteSafetyRows([JITA, THERA, UEDAMA], inputs());
    expect(summarizeRouteSafety(rows)).toMatchObject({
      jumps: 2,
      highsec: 2,
      lowsec: 0,
      nullsec: 0,
      lowestSecurity: 0.5,
    });
  });

  it("never makes a wormhole system the strip's lowest-security key system", () => {
    const rows = [
      row(1, { security: 0.9 }),
      row(THERA, { security: -1 }),
      row(3, { security: 0.6 }),
      row(4, { security: 0.8 }),
    ];
    expect(routeStripKeySystems(rows)).toEqual([0, 2, 3]);
  });
});

describe('routeStripKeySystems', () => {
  it('names the ends, the first lowest-security system and every chokepoint, in route order', () => {
    const rows = [
      row(1, { security: 0.9 }),
      row(2, { security: 0.5 }),
      row(3, { security: 0.7, chokepoint: true }),
      row(4, { security: 0.5 }),
      row(5, { security: 0.8 }),
    ];
    expect(routeStripKeySystems(rows)).toEqual([0, 1, 2, 4]);
  });

  it('names a system once when it is several kinds of key', () => {
    const rows = [row(1, { security: 0.4, chokepoint: true }), row(2, { security: 0.9 })];
    expect(routeStripKeySystems(rows)).toEqual([0, 1]);
  });

  it('skips the lowest when no security is known', () => {
    const rows = [
      row(1, { security: null }),
      row(2, { security: null }),
      row(3, { security: null }),
    ];
    expect(routeStripKeySystems(rows)).toEqual([0, 2]);
  });
});

describe('routeStripKeySystems with stops', () => {
  it('also names each stop the trip passes', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    expect(routeStripKeySystems(rows, [2])).toEqual([0, 2, 4]);
  });
});

describe('joinLegs', () => {
  it('joins legs end to end, each joining stop once, and marks where every stop falls', () => {
    const trip = joinLegs([
      [row(1), row(2), row(3)],
      [row(3), row(4)],
      [row(4), row(2), row(1)],
    ]);
    expect(trip.rows.map((r) => r.systemId)).toEqual([1, 2, 3, 4, 2, 1]);
    expect(trip.stopIndexes).toEqual([2, 3, 5]);
  });

  it('is empty with no legs', () => {
    expect(joinLegs([])).toEqual({ rows: [], stopIndexes: [] });
  });
});

describe('summarizeTrip', () => {
  it('sums the jumps of every leg', () => {
    const legs = [
      buildRouteSafetyRows([JITA, PERIMETER, UEDAMA], inputs()),
      buildRouteSafetyRows([UEDAMA, PERIMETER, JITA], inputs()),
    ];
    expect(summarizeTrip(legs).jumps).toBe(4);
  });

  it('counts a system crossed twice once for its kills and its chokepoint', () => {
    const legs = [
      buildRouteSafetyRows([JITA, PERIMETER, UEDAMA, AMAMAKE], inputs()),
      buildRouteSafetyRows([AMAMAKE, UEDAMA, PERIMETER], inputs()),
    ];
    const summary = summarizeTrip(legs);
    expect(summary.shipKills).toBe(15);
    expect(summary.podKills).toBe(5);
    expect(summary.chokepoints).toEqual(['Uedama']);
    expect(summary.lowestSecurity).toBe(0.3);
  });
});
