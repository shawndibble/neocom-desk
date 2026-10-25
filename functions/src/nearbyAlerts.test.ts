import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEARBY_ROUTE_RULES,
  NEARBY_PUSH_LOG_TTL_MS,
  computeDeviceNearby,
  incursionNearbyOccurrenceKey,
  jumpDistancesUnder,
  notYetPushed,
  recordPushed,
  skyhookRaidableNearbyOccurrenceKey,
  type DeviceCharacterNearby,
  type NearbyLists,
  type StoredNearby,
} from './nearbyAlerts.js';
import { INCURSION_STATES } from './incursionState.js';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('engine mirrors', () => {
  it('skyhookAlert.ts matches src/engine/skyhooks/skyhookAlert.ts', () => {
    const mirror = text('./skyhookAlert.ts').split('\n').slice(1).join('\n');
    expect(mirror).toBe(text('../../src/engine/skyhooks/skyhookAlert.ts'));
  });
  it('incursionAlert.ts matches src/engine/incursions/incursionAlert.ts but for its import', () => {
    const mirror = text('./incursionAlert.ts')
      .split('\n')
      .slice(1)
      .join('\n')
      .replace("from './incursionState.js'", "from './incursionRows'");
    expect(mirror).toBe(text('../../src/engine/incursions/incursionAlert.ts'));
  });
  it('INCURSION_STATES matches src/engine/incursions/incursionRows.ts', () => {
    expect(text('../../src/engine/incursions/incursionRows.ts')).toContain(
      `export const INCURSION_STATES = ${JSON.stringify(INCURSION_STATES).replace(/"/g, "'").replace(/,/g, ', ')} as const;`
    );
  });
});

describe('Occurrence Keys', () => {
  // The literals are pinned on the client side too (src/engine/occurrenceKey.test.ts):
  // a push and the Foreground Poller must key the same feed row.
  it('match the Foreground Poller derivation', () => {
    expect(skyhookRaidableNearbyOccurrenceKey(30000142, 40009077, 1_700_000_000_000)).toBe(
      'skyhookRaidableNearby:30000142:40009077:1700000000000'
    );
    expect(incursionNearbyOccurrenceKey(20000020, 30000142)).toBe(
      'incursionNearby:20000020:30000142'
    );
  });
});

// A line: 1 - 2 - 3 - 4 - 5 - 6, origin wherever the test says.
function lineDistances(origin: number): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (let id = 1; id <= 6; id++) map.set(id, Math.abs(id - origin));
  return map;
}

const NOW = 1_000_000;
const HOUR = 3_600_000;

function lists(over: Partial<NearbyLists> = {}): NearbyLists {
  return {
    skyhooks: [
      {
        solar_system_id: 3,
        planet_id: 300,
        theft_vulnerability: {
          start: new Date(NOW + HOUR).toISOString(),
          end: new Date(NOW + 2 * HOUR).toISOString(),
        },
      },
      // No readable window: dropped, as the app drops it.
      { solar_system_id: 2, planet_id: 200 },
    ],
    incursions: [
      { constellation_id: 900, staging_solar_system_id: 4, state: 'established' },
      { constellation_id: 901, staging_solar_system_id: 2, state: 'withdrawing' },
      { constellation_id: 902, staging_solar_system_id: 2, state: 'some-new-state' },
    ],
    ...over,
  };
}

function character(over: Partial<DeviceCharacterNearby> = {}): DeviceCharacterNearby {
  return {
    characterId: 7,
    originSystemId: 1,
    events: ['incursionNearby', 'skyhookRaidableNearby'],
    nearbyJumps: { incursionNearby: 5, skyhookRaidableNearby: 5 },
    ...over,
  };
}

function run(
  characters: DeviceCharacterNearby[],
  prev: Record<string, StoredNearby>,
  over: { lists?: NearbyLists; nowMs?: number } = {}
) {
  return computeDeviceNearby({
    characters,
    prev,
    lists: over.lists ?? lists(),
    nowMs: over.nowMs ?? NOW,
    distancesFrom: lineDistances,
  });
}

describe('computeDeviceNearby', () => {
  it('fires nothing on the first poll and stores a baseline (no prior snapshot)', () => {
    const first = run([character()], {});
    expect(first.fires).toEqual([]);
    expect(first.next['7'].skyhook).toEqual({
      frame: { originSystemId: 1, withinJumps: 5 },
      inRange: [
        {
          systemId: 3,
          planetId: 300,
          startMs: NOW + HOUR,
          endMs: NOW + 2 * HOUR,
          jumps: 2,
          originSystemId: 1,
          withinJumps: 5,
        },
      ],
    });
  });

  it('fires an Incursion and a raid window coming into range in the same frame', () => {
    const empty = run([character()], {}, { lists: { skyhooks: [], incursions: [] } });
    const second = run([character()], empty.next);
    expect(second.fires.map((f) => f.occurrenceKey).sort()).toEqual([
      'incursionNearby:900:4',
      `skyhookRaidableNearby:3:300:${NOW + HOUR}`,
    ]);
    expect(second.fires.find((f) => f.fire.eventId === 'incursionNearby')?.fire).toEqual({
      eventId: 'incursionNearby',
      characterId: 7,
      constellationId: 900,
      stagingSystemId: 4,
      state: 'established',
      jumps: 3,
    });
  });

  it('does not fire again while it stays in range', () => {
    const empty = run([character()], {}, { lists: { skyhooks: [], incursions: [] } });
    const second = run([character()], empty.next);
    expect(run([character()], second.next).fires).toEqual([]);
  });

  it('re-baselines silently when the origin moves (the app does the same)', () => {
    const far = run([character({ originSystemId: 6 })], {}, {});
    // From 6, the Incursion at 4 is 2 jumps, already in range: nothing new.
    // Now the pilot moves to 1: a new frame, so nothing fires.
    expect(run([character({ originSystemId: 1 })], far.next).fires).toEqual([]);
  });

  it('re-baselines silently when N changes, even with nothing in range before', () => {
    const narrow = character({ nearbyJumps: { incursionNearby: 0, skyhookRaidableNearby: 0 } });
    const before = run([narrow], {});
    expect(before.next['7'].incursion).toEqual({
      frame: { originSystemId: 1, withinJumps: 0 },
      inRange: [],
    });
    expect(run([character()], before.next).fires).toEqual([]);
  });

  it('keeps the stored state for an event whose list could not be read', () => {
    const first = run([character()], {});
    const failed = run([character()], first.next, { lists: { skyhooks: null, incursions: null } });
    expect(failed.fires).toEqual([]);
    expect(failed.next['7']).toEqual(first.next['7']);
  });

  it('drops the state of an event the device has not enabled, or has no threshold for', () => {
    const first = run([character()], {});
    const next = run(
      [character({ events: ['incursionNearby'], nearbyJumps: { skyhookRaidableNearby: 5 } })],
      first.next
    );
    expect(next.next['7']).toEqual({});
  });

  it('keeps one copy of a world-scoped fire across Characters: the nearest, then the lowest id', () => {
    const quiet = { skyhooks: [], incursions: [] };
    const a = character({ characterId: 9, originSystemId: 2 });
    const b = character({ characterId: 8, originSystemId: 1 });
    const c = character({ characterId: 5, originSystemId: 6 });
    const base = run([a, b, c], {}, { lists: quiet });
    const fires = run([a, b, c], base.next).fires.filter(
      (f) => f.fire.eventId === 'incursionNearby'
    );
    // Staging system 4: a is 2 jumps, b is 3, c is 2 — a tie on jumps goes to the lower id.
    expect(fires.map((f) => f.fire.characterId)).toEqual([5]);
  });

  it('never stores an expired raid window', () => {
    const first = run([character()], {});
    const later = run([character()], first.next, { nowMs: NOW + 3 * HOUR });
    expect(later.next['7'].skyhook?.inRange).toEqual([]);
  });

  it('a Character not polled this run keeps its state', () => {
    const first = run([character()], {});
    const other = run([character({ characterId: 8 })], first.next, {});
    expect(other.next['7']).toEqual(first.next['7']);
    expect(Object.keys(other.next).sort()).toEqual(['7', '8']);
  });
});

describe('push log', () => {
  it('drops fires already pushed to the device inside the TTL, and records new ones', () => {
    const log = recordPushed({}, ['a'], NOW);
    expect(log).toEqual({ a: NOW + NEARBY_PUSH_LOG_TTL_MS });
    expect(notYetPushed(log, 'a', NOW + 1)).toBe(false);
    expect(notYetPushed(log, 'a', NOW + NEARBY_PUSH_LOG_TTL_MS)).toBe(true);
    expect(notYetPushed(log, 'b', NOW)).toBe(true);
    // Expired entries are pruned on the next write.
    expect(recordPushed(log, ['b'], NOW + NEARBY_PUSH_LOG_TTL_MS)).toEqual({
      b: NOW + 2 * NEARBY_PUSH_LOG_TTL_MS,
    });
  });
});

describe('jumpDistancesUnder (real stargate graph)', () => {
  it('counts Jita to Perimeter as one jump and to itself as zero', () => {
    const jumps = jumpDistancesUnder(30000142, DEFAULT_NEARBY_ROUTE_RULES);
    expect(jumps.get(30000142)).toBe(0);
    expect(jumps.get(30000144)).toBe(1);
  });
  it('treats an Avoided System as a cost: a route around it is longer', () => {
    const plain = jumpDistancesUnder(30000142, {
      ...DEFAULT_NEARBY_ROUTE_RULES,
      preference: 'shortest',
    });
    const avoiding = jumpDistancesUnder(30000142, {
      preference: 'shortest',
      securityPenalty: 50,
      avoid: [30000144],
    });
    expect(avoiding.get(30000144)).toBe(1);
    expect([...plain.values()].length).toBe([...avoiding.values()].length);
  });
});
