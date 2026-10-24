import { describe, expect, it } from 'vitest';
import type { HaulLeg } from './haulPlan';
import type { RouteSafetyRow } from './routeSafety';
import {
  legCarry,
  legCondition,
  legWaypointIds,
  sectionWaypointIds,
  splitPlaceName,
} from './haulLeg';

const row = (band: RouteSafetyRow['band'], systemId = 1): RouteSafetyRow => ({
  systemId,
  name: `S${systemId}`,
  security: band === 'highsec' ? 0.9 : band === 'lowsec' ? 0.3 : band === 'nullsec' ? -0.2 : null,
  band,
  regionId: null,
  regionName: null,
  jumps: null,
  shipKills: null,
  podKills: null,
  npcKills: null,
  chokepoint: false,
});

const leg = (over: Partial<HaulLeg>): HaulLeg => ({
  id: 0,
  characterId: 1,
  trip: 1,
  kind: 'pickup',
  from: null,
  to: { systemId: 30000142, stationId: 60003760, name: 'Jita 4-4' },
  jumps: 5,
  m3: 80,
  locationId: 1,
  ...over,
});

describe('legCondition', () => {
  it('states a condition, never a verdict', () => {
    expect(legCondition([row('highsec'), row('highsec')])).toEqual({ kind: 'highsec' });
  });
  it('counts lowsec systems flown through', () => {
    expect(legCondition([row('highsec'), row('lowsec'), row('lowsec')])).toEqual({
      kind: 'lowsec',
      count: 2,
    });
  });
  it('nullsec outranks lowsec and counts its own systems', () => {
    expect(legCondition([row('lowsec'), row('nullsec'), row('nullsec')])).toEqual({
      kind: 'nullsec',
      count: 2,
    });
  });
  it('is unknown with no systems or an unplaced one, never "all highsec"', () => {
    expect(legCondition([])).toEqual({ kind: 'unknown' });
    expect(legCondition([row('highsec'), row(null)])).toEqual({ kind: 'unknown' });
  });
});

describe('waypoint ids', () => {
  it('prefers the station over its system', () => {
    expect(legWaypointIds(leg({}))).toEqual([60003760]);
    expect(legWaypointIds(leg({ to: { systemId: 5, stationId: null, name: 'X' } }))).toEqual([5]);
    expect(legWaypointIds(leg({ to: { systemId: null, stationId: null, name: 'X' } }))).toEqual([]);
  });
  it('lists a section end to end, collapsing a repeated stop', () => {
    const a = { systemId: 1, stationId: 11, name: 'A' };
    const b = { systemId: 2, stationId: 22, name: 'B' };
    expect(
      sectionWaypointIds([leg({ to: a }), leg({ to: b }), leg({ to: b }), leg({ to: a })])
    ).toEqual([11, 22, 11]);
  });
});

describe('legCarry', () => {
  it('flies empty to a pickup and carries the load on a delivery', () => {
    expect(legCarry(leg({ kind: 'pickup' }))).toBe('empty');
    expect(legCarry(leg({ kind: 'delivery' }))).toBe('loaded');
  });
});

describe('splitPlaceName', () => {
  it('keeps the system and moves the station to a second line', () => {
    expect(splitPlaceName('Jita IV - Moon 4 - Caldari Navy Assembly Plant')).toEqual({
      system: 'Jita IV',
      detail: 'Moon 4 - Caldari Navy Assembly Plant',
    });
    expect(splitPlaceName('Amarr')).toEqual({ system: 'Amarr', detail: null });
  });
});
