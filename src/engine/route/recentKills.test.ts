import { describe, expect, it } from 'vitest';
import {
  HEAVY_INTERDICTION_CRUISER_GROUP_ID,
  INTERDICTOR_GROUP_ID,
  SMART_BOMB_GROUP_ID,
  classifyKillTags,
  summarizeRecentKills,
  type RecentKill,
  type ResolvedLocation,
} from './recentKills';

// Type ids from the SDE (`public/data/types.json`), with the group each sits in.
const SABRE = 22456; // Interdictor
const ONYX = 11995; // Heavy Interdiction Cruiser
const LARGE_EMP_SMARTBOMB_II = 3995; // Smart Bomb
const HURRICANE = 24702;
const TORNADO = 4310;
const HEAVY_NEUTRON_BLASTER = 2921;

const GROUPS = new Map<number, number>([
  [SABRE, INTERDICTOR_GROUP_ID],
  [ONYX, HEAVY_INTERDICTION_CRUISER_GROUP_ID],
  [LARGE_EMP_SMARTBOMB_II, SMART_BOMB_GROUP_ID],
  [HURRICANE, 26],
  [TORNADO, 1201],
  [HEAVY_NEUTRON_BLASTER, 74],
]);
const groupOf = (typeId: number) => GROUPS.get(typeId);

const NOURVUKAIKEN = 30001376;
const TAMA = 30002813;
const OTHER_NEIGHBOUR = 30002812;
const NOURVUKAIKEN_GATE = 50014002;
const OFF_PATH_GATE = 50014003;
const STATION = 60012157;
const MOON = 40178880;

const LOCATIONS = new Map<number, ResolvedLocation>([
  [
    NOURVUKAIKEN_GATE,
    { kind: 'stargate', name: 'Stargate (Nourvukaiken)', destinationSystemId: NOURVUKAIKEN },
  ],
  [
    OFF_PATH_GATE,
    { kind: 'stargate', name: 'Stargate (Kedama)', destinationSystemId: OTHER_NEIGHBOUR },
  ],
  [STATION, { kind: 'station', name: 'Tama VII - Moon 9 - Republic Security Services' }],
]);

const NOW = Date.parse('2026-09-30T05:30:00Z');

function kill(
  id: number,
  time: string,
  locationId: number | null,
  attackers: RecentKill['attackers'] = [{ shipTypeId: HURRICANE, weaponTypeId: HURRICANE }]
): RecentKill {
  return { killmailId: id, time: Date.parse(time), locationId, attackers };
}

describe('classifyKillTags', () => {
  it('tags a bubble when an Interdictor or a Heavy Interdiction Cruiser is on the mail in nullsec', () => {
    expect(
      classifyKillTags(kill(1, '2026-09-30T05:00:00Z', null, [{ shipTypeId: SABRE }]), {
        groupOf,
        band: 'nullsec',
      })
    ).toEqual({ bubble: true, smartbomb: false });
    expect(
      classifyKillTags(kill(2, '2026-09-30T05:00:00Z', null, [{ shipTypeId: ONYX }]), {
        groupOf,
        band: 'nullsec',
      })
    ).toEqual({ bubble: true, smartbomb: false });
  });

  it('never tags a bubble outside nullsec, where they cannot be launched', () => {
    for (const band of ['highsec', 'lowsec'] as const) {
      expect(
        classifyKillTags(kill(1, '2026-09-30T05:00:00Z', null, [{ shipTypeId: SABRE }]), {
          groupOf,
          band,
        }).bubble
      ).toBe(false);
    }
  });

  it('tags a smartbomb from any attacker weapon in the Smart Bomb group, in any band', () => {
    const mail = kill(1, '2026-09-30T05:00:00Z', null, [
      { shipTypeId: HURRICANE, weaponTypeId: HEAVY_NEUTRON_BLASTER },
      { shipTypeId: TORNADO, weaponTypeId: LARGE_EMP_SMARTBOMB_II },
    ]);
    expect(classifyKillTags(mail, { groupOf, band: 'highsec' })).toEqual({
      bubble: false,
      smartbomb: true,
    });
  });

  it('tags nothing when no attacker type is known, or the band is unknown', () => {
    const mail = kill(1, '2026-09-30T05:00:00Z', null, [{ shipTypeId: 999_999 }, {}]);
    expect(classifyKillTags(mail, { groupOf, band: 'nullsec' })).toEqual({
      bubble: false,
      smartbomb: false,
    });
    const sabre = kill(2, '2026-09-30T05:00:00Z', null, [{ shipTypeId: SABRE }]);
    expect(classifyKillTags(sabre, { groupOf, band: null }).bubble).toBe(false);
  });
});

describe('summarizeRecentKills', () => {
  const context = {
    groupOf,
    band: 'nullsec' as const,
    locations: LOCATIONS,
    pathNeighbours: new Set([NOURVUKAIKEN, 30001375]),
    now: NOW,
  };

  it('counts the kills and dates the most recent in minutes before now', () => {
    const summary = summarizeRecentKills(
      [
        kill(1, '2026-09-30T04:40:00Z', NOURVUKAIKEN_GATE),
        kill(2, '2026-09-30T04:58:00Z', NOURVUKAIKEN_GATE),
      ],
      context
    );
    expect(summary.count).toBe(2);
    expect(summary.minutesSinceLast).toBe(32);
  });

  it('is empty, with no last kill, when nothing died', () => {
    expect(summarizeRecentKills([], context)).toEqual({
      count: 0,
      minutesSinceLast: null,
      bubble: false,
      smartbomb: false,
      locations: [],
    });
  });

  it('groups kills by location, busiest first, and marks gates on the path', () => {
    const summary = summarizeRecentKills(
      [
        kill(1, '2026-09-30T05:00:00Z', STATION),
        kill(2, '2026-09-30T04:40:00Z', NOURVUKAIKEN_GATE),
        kill(3, '2026-09-30T04:58:00Z', NOURVUKAIKEN_GATE, [
          { shipTypeId: TORNADO, weaponTypeId: LARGE_EMP_SMARTBOMB_II },
        ]),
        kill(4, '2026-09-30T05:10:00Z', OFF_PATH_GATE, [{ shipTypeId: SABRE }]),
        kill(5, '2026-09-30T04:50:00Z', NOURVUKAIKEN_GATE),
      ],
      context
    );

    expect(summary.locations).toEqual([
      {
        key: String(NOURVUKAIKEN_GATE),
        kind: 'stargate',
        name: 'Stargate (Nourvukaiken)',
        onPath: true,
        count: 3,
        minutesSinceLast: 32,
        bubble: false,
        smartbomb: true,
      },
      {
        key: String(OFF_PATH_GATE),
        kind: 'stargate',
        name: 'Stargate (Kedama)',
        onPath: false,
        count: 1,
        minutesSinceLast: 20,
        bubble: true,
        smartbomb: false,
      },
      {
        key: String(STATION),
        kind: 'station',
        name: 'Tama VII - Moon 9 - Republic Security Services',
        onPath: false,
        count: 1,
        minutesSinceLast: 30,
        bubble: false,
        smartbomb: false,
      },
    ]);
    expect(summary).toMatchObject({ count: 5, bubble: true, smartbomb: true });
  });

  it('pools every location it cannot name into one unnamed group', () => {
    const summary = summarizeRecentKills(
      [kill(1, '2026-09-30T05:00:00Z', MOON), kill(2, '2026-09-30T05:05:00Z', null)],
      context
    );
    expect(summary.locations).toEqual([
      {
        key: 'other',
        kind: 'other',
        name: null,
        onPath: false,
        count: 2,
        minutesSinceLast: 25,
        bubble: false,
        smartbomb: false,
      },
    ]);
  });

  it('never reads a kill stamped after now as negative minutes', () => {
    const summary = summarizeRecentKills([kill(1, '2026-09-30T05:31:00Z', null)], context);
    expect(summary.minutesSinceLast).toBe(0);
  });

  it('keeps the system in view: a system with no gate data still lists its kills', () => {
    const summary = summarizeRecentKills([kill(1, '2026-09-30T05:00:00Z', NOURVUKAIKEN_GATE)], {
      ...context,
      locations: new Map(),
    });
    expect(summary.locations).toEqual([expect.objectContaining({ kind: 'other', count: 1 })]);
  });

  it('marks a gate on the path only when it leads to the previous or next system', () => {
    const summary = summarizeRecentKills([kill(1, '2026-09-30T05:00:00Z', NOURVUKAIKEN_GATE)], {
      ...context,
      pathNeighbours: new Set([TAMA]),
    });
    expect(summary.locations[0].onPath).toBe(false);
  });
});
