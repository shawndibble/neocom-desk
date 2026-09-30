import { describe, expect, it } from 'vitest';
import {
  buildRouteSafetyRows,
  indexSystemJumps,
  indexSystemKills,
  summarizeRouteSafety,
  type RouteSafetyInputs,
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
