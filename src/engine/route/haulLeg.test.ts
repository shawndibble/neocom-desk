import { describe, expect, it } from 'vitest';
import type { HaulLeg } from './haulPlan';
import type { RouteSafetyRow } from './routeSafety';
import {
  heldItems,
  legCondition,
  legHold,
  legStopAction,
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
  it('still reports the lowsec it can see beside an unplaced system', () => {
    expect(legCondition([row('lowsec'), row(null)])).toEqual({ kind: 'lowsec', count: 1 });
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

describe('legHold', () => {
  const at = (n: number) => ({ systemId: n, stationId: null, name: `P${n}` });
  const legs = [
    leg({ id: 0, trip: 1, kind: 'pickup', to: at(1), m3: 30 }),
    leg({ id: 1, trip: 1, kind: 'pickup', to: at(2), m3: 50 }),
    leg({ id: 2, trip: 1, kind: 'delivery', to: at(9), m3: 80 }),
    leg({ id: 3, trip: 2, kind: 'pickup', to: at(3), m3: 20 }),
  ];
  it('flies the first pickup of a trip empty and loads on arrival', () => {
    expect(legHold(legs, legs[0])).toEqual({
      aboard: [],
      loadsOnArrival: { place: 'P1', m3: 30 },
    });
  });
  it('carries the earlier pickups of the trip to a later pickup', () => {
    expect(legHold(legs, legs[1])).toEqual({
      aboard: [{ place: 'P1', m3: 30 }],
      loadsOnArrival: { place: 'P2', m3: 50 },
    });
  });
  it('lists the items aboard and loading, merged by type, where the legs carry stacks', () => {
    const trit = { typeId: 34, name: 'Tritanium', unitM3: 1 };
    const pye = { typeId: 35, name: 'Pyerite', unitM3: 2 };
    const stacked = [
      leg({
        id: 0,
        trip: 1,
        kind: 'pickup',
        to: at(1),
        m3: 30,
        stacks: [{ ...trit, quantity: 30 }],
      }),
      leg({
        id: 1,
        trip: 1,
        kind: 'pickup',
        to: at(2),
        m3: 50,
        stacks: [
          { ...trit, quantity: 10 },
          { ...pye, quantity: 20 },
        ],
      }),
      leg({ id: 2, trip: 1, kind: 'delivery', to: at(9), m3: 80 }),
    ];
    expect(legHold(stacked, stacked[1]).aboard[0].stacks).toEqual([{ ...trit, quantity: 30 }]);
    expect(legHold(stacked, stacked[1]).loadsOnArrival?.stacks).toHaveLength(2);
    expect(heldItems(legHold(stacked, stacked[2]).aboard)).toEqual([
      { ...trit, quantity: 40 },
      { ...pye, quantity: 20 },
    ]);
  });

  it('has no item list when a saved haul predates stacks', () => {
    expect(heldItems(legHold(legs, legs[2]).aboard)).toBeNull();
  });

  it('carries every pickup of the trip to the delivery, and not the next trip', () => {
    expect(legHold(legs, legs[2])).toEqual({
      aboard: [
        { place: 'P1', m3: 30 },
        { place: 'P2', m3: 50 },
      ],
      loadsOnArrival: null,
    });
    expect(legHold(legs, legs[3]).aboard).toEqual([]);
  });
});

describe('legStopAction', () => {
  const at = (n: number) => ({ systemId: n, stationId: null, name: `P${n}` });
  const trit = { typeId: 34, name: 'Tritanium', unitM3: 1 };
  const pye = { typeId: 35, name: 'Pyerite', unitM3: 2 };
  const legs = [
    leg({
      id: 0,
      trip: 1,
      kind: 'pickup',
      to: at(1),
      m3: 30,
      stacks: [{ ...trit, quantity: 30 }],
    }),
    leg({
      id: 1,
      trip: 1,
      kind: 'pickup',
      to: at(2),
      m3: 40,
      stacks: [
        { ...trit, quantity: 10 },
        { ...pye, quantity: 15 },
      ],
    }),
    leg({ id: 2, trip: 1, kind: 'delivery', to: at(9), m3: 70 }),
  ];

  it('loads what a pickup leg picks up, with its items', () => {
    expect(legStopAction(legs, legs[1])).toEqual({
      kind: 'load',
      m3: 40,
      stacks: legs[1].stacks,
    });
  });

  it('drops everything aboard at the delivery, items merged by type', () => {
    expect(legStopAction(legs, legs[2])).toEqual({
      kind: 'drop',
      m3: 70,
      stacks: [
        { ...trit, quantity: 40 },
        { ...pye, quantity: 15 },
      ],
    });
  });

  it('has no item list where a saved haul predates stacks', () => {
    const old = [leg({ id: 0, kind: 'pickup', to: at(1), m3: 5 })];
    expect(legStopAction(old, old[0])).toEqual({ kind: 'load', m3: 5, stacks: null });
  });

  it('takes the ship at a pickup flight and does nothing at its delivery', () => {
    const flight = [
      leg({ id: 0, kind: 'pickup', to: at(1), m3: 0, ships: ['Rifter'] }),
      leg({ id: 1, kind: 'delivery', to: at(9), m3: 0, ships: ['Rifter'] }),
    ];
    expect(legStopAction(flight, flight[0])).toEqual({ kind: 'take', ships: ['Rifter'] });
    expect(legStopAction(flight, flight[1])).toBeNull();
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
