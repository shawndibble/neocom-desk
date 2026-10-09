import { describe, expect, it } from 'vitest';
import type { JumpSystem } from './jumpDrive';
import type { JumpGraph } from './jumpRoute';
import { parseLegPin } from './legWays';
import type { RouteSafetySystemEntry } from './routeSafety';
import { assembleRouteSafety, planLegAlternatives } from './routeSafetyTrip';
import { planTrip } from './tripPlan';
import { waypointSequence } from './waypoints';

// A gate chain of 12 lowsec systems, one ly apart: jumping pays on the way.
const IDS = Array.from({ length: 12 }, (_, i) => 30000001 + i);
const GRAPH: JumpGraph = new Map(
  IDS.map((id, i) => [id, [IDS[i - 1], IDS[i + 1]].filter((n) => n !== undefined)])
);
const SYSTEMS: JumpSystem[] = IDS.map((id, i) => ({
  id,
  x: i,
  y: 0,
  z: 0,
  security: -0.2,
  regionId: 1,
}));
const ENTRIES: ReadonlyMap<number, RouteSafetySystemEntry> = new Map(
  IDS.map((id) => [id, { id, name: `S${id}`, security: -0.2, regionId: 1 }])
);
const DRIVE = { rangeLy: 4, fuelPerLy: 100, distanceFactor: 1 };
const FROM = IDS[0];
const TO = IDS[11];

function assemble(pin: string) {
  const plan = planTrip(GRAPH, FROM, [TO]);
  const jump = { systems: SYSTEMS, drive: DRIVE };
  const { legs } = planLegAlternatives(
    { plan, graph: GRAPH, options: {} },
    { holes: [], bridges: [] },
    { tokens: [pin], listed: [] },
    jump
  );
  return assembleRouteSafety({
    planned: { plan, graph: GRAPH },
    alternatives: legs,
    singleStop: true,
    pins: [pin],
    holes: [],
    listed: [],
    bridges: null,
    systems: ENTRIES,
    regionNames: new Map([[1, 'R']]),
    activity: null,
    jump: {
      positions: new Map(SYSTEMS.map((s) => [s.id, s])),
      drive: DRIVE,
    },
  });
}

describe('jump drive legs in a Route Safety trip', () => {
  it('lists a Jump drive way beside gates, with its fuel and fatigue', () => {
    const result = assemble('');
    expect(result.kind).toBe('route');
    if (result.kind !== 'route') return;
    const ways = result.legs[0].ways;
    expect(ways.map((way) => way.kind)).toEqual(['gates', 'jump']);
    expect(ways[0].jump).toBeNull();
    const byDrive = ways[1];
    expect(byDrive.pin).toBe('jump');
    expect(byDrive.jump?.jumps).toBeGreaterThan(0);
    expect(byDrive.jump?.fuel).toBeGreaterThan(0);
    expect(byDrive.jump?.fatigueMinutes).toBeGreaterThan(0);
    expect(result.trip?.driveJumps).toBe(0);
    expect(result.trip?.jump).toBeNull();
  });

  it('flies the leg by jump drive when it is pinned, tagging each jump hop', () => {
    expect(parseLegPin('jump')).toEqual({ kind: 'jump' });
    const result = assemble('jump');
    expect(result.kind).toBe('route');
    if (result.kind !== 'route') return;
    const rows = result.legs[0].rows ?? [];
    const jumps = rows.filter((row) => row.entry?.kind === 'jump');
    expect(jumps.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(IDS.length);
    expect(result.trip?.driveJumps).toBe(jumps.length);
    expect(result.trip?.jump?.fuel).toBeGreaterThan(0);
    expect(result.legs[0].ways.find((way) => way.inUse)?.kind).toBe('jump');
    // The client's autopilot cannot fly a jump: waypoints stop at its entrance.
    expect(waypointSequence(result.legs).cutOff?.kind).toBe('jump');
  });

  it('offers no Jump drive way when jump legs are off', () => {
    const plan = planTrip(GRAPH, FROM, [TO]);
    const { legs } = planLegAlternatives(
      { plan, graph: GRAPH, options: {} },
      { holes: [], bridges: [] },
      { tokens: [''], listed: [] }
    );
    expect(legs[0].ways.map((way) => way.way)).toEqual(['gates']);
  });
});
