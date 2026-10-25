import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { HaulLeg } from '@/engine/route/haulPlan';
import type { MovePlan } from '@/engine/assets/movePlan';
import {
  carriableStacks,
  legRouteHref,
  sectionRouteHref,
  useActiveHaul,
  type ActiveHaul,
} from './activeHaul';

const place = { systemId: 30000142, stationId: 60003760, name: 'Jita 4-4' };
const haul: ActiveHaul = {
  id: 'abc',
  createdAt: 1,
  capacityM3: 100,
  destination: place,
  plan: {
    sections: [{ characterId: 1, name: 'Alice', trips: 1, legs: [] }],
    leftOut: [],
    flown: [],
    totals: { legs: 0, jumps: 0, m3: 0 },
  },
};

describe('legRouteHref', () => {
  const leg: HaulLeg = {
    id: 3,
    characterId: 1,
    trip: 1,
    kind: 'pickup',
    from: { systemId: 30002187, stationId: null, name: 'Amarr' },
    to: place,
    jumps: 10,
    m3: 5,
    locationId: 60003760,
  };

  it('opens Route Safety from the leg start to its stop, station tag included', () => {
    const href = legRouteHref(leg)!;
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('from')).toBe('30002187');
    expect(params.get('stops')).toBe('30000142:60003760');
  });

  it('leaves the start to Route Safety when the leg has none', () => {
    const params = new URL(legRouteHref({ ...leg, from: null })!, 'http://x').searchParams;
    expect(params.has('from')).toBe(false);
  });

  it('has no link for a stop with no system', () => {
    expect(legRouteHref({ ...leg, to: { ...place, systemId: null } })).toBeNull();
  });
});

describe('useActiveHaul', () => {
  it('survives a reload: a saved haul reads back unchanged', async () => {
    await useActiveHaul.getState().setValue(haul);
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value).toEqual(haul);
    await useActiveHaul.getState().setValue(null);
  });

  it('keeps ticked legs across a reload', async () => {
    await useActiveHaul.getState().setValue({ ...haul, doneLegIds: [0, 1] });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value?.doneLegIds).toEqual([0, 1]);
    await useActiveHaul.getState().setValue(null);
  });
});

describe('useActiveHaul parse', () => {
  const pickupLeg = {
    id: 0,
    characterId: 1,
    trip: 1,
    kind: 'pickup' as const,
    from: null,
    to: place,
    jumps: 1,
    m3: 5,
    locationId: 7,
  };
  const withLeg = (extra: object): ActiveHaul => ({
    ...haul,
    plan: {
      ...haul.plan,
      sections: [{ characterId: 1, name: 'Alice', trips: 1, legs: [{ ...pickupLeg, ...extra }] }],
    },
  });

  it('reads a haul saved before item stacks', async () => {
    await db.settings.put({ key: 'activeHaul', value: withLeg({}) });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value?.plan.sections[0].legs[0].stacks).toBeUndefined();
    await db.settings.delete('activeHaul');
  });

  it('ignores a haul whose stacks are malformed', async () => {
    await db.settings.put({ key: 'activeHaul', value: withLeg({ stacks: [{ typeId: 'x' }] }) });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value).toBeNull();
    await db.settings.delete('activeHaul');
  });

  it('keeps a limit, leg values and stack prices across a reload', async () => {
    const priced = {
      ...withLeg({
        isk: 600,
        stacks: [{ typeId: 34, name: 'Tritanium', quantity: 6, unitM3: 1, unitIsk: 100 }],
      }),
      maxIskPerHaul: 600,
    };
    await db.settings.put({ key: 'activeHaul', value: priced });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value).toEqual(priced);
    await db.settings.delete('activeHaul');
  });

  it('ignores a haul whose leg value or stack price is not a number', async () => {
    for (const extra of [
      { isk: 'x' },
      { stacks: [{ typeId: 1, name: 'a', quantity: 1, unitM3: 1, unitIsk: 'x' }] },
    ]) {
      await db.settings.put({ key: 'activeHaul', value: withLeg(extra) });
      useActiveHaul.setState({ value: null, hydrated: false });
      await useActiveHaul.getState().hydrate();
      expect(useActiveHaul.getState().value).toBeNull();
    }
    await db.settings.delete('activeHaul');
  });

  it('ignores a stored value that is not a haul', async () => {
    await db.settings.put({ key: 'activeHaul', value: { id: 1 } });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value).toBeNull();
    await db.settings.delete('activeHaul');
  });

  it('ignores a haul whose ticked legs are not ids', async () => {
    await db.settings.put({ key: 'activeHaul', value: { ...haul, doneLegIds: ['x'] } });
    useActiveHaul.setState({ value: null, hydrated: false });
    await useActiveHaul.getState().hydrate();
    expect(useActiveHaul.getState().value).toBeNull();
    await db.settings.delete('activeHaul');
  });
});

describe('carriableStacks', () => {
  const lines = [
    { typeId: 34, quantity: 1000, m3: 10 },
    { typeId: 648, quantity: 2, m3: 2000 },
    { typeId: 99, quantity: 3, m3: 30 },
    { typeId: 5, quantity: 1, m3: null },
  ];
  const plan = {
    perCharacter: [{ characterId: 1, pickups: [{ locationId: 7, lines }] }],
    active: {
      pickups: [
        {
          characterId: 1,
          locationId: 7,
          hauls: [],
          unfit: [{ typeId: 648, quantity: 2, unitM3: 1000 }],
          tooBigShips: [{ typeId: 99, quantity: 1, unitM3: 10 }],
        },
      ],
    },
  } as unknown as MovePlan;
  const name = (id: number) => `T${id}`;

  it('lists what the hauler carries: unfit stacks and too-big ships come out, unknown volumes stay out', () => {
    expect(carriableStacks(plan, 1, 7, lines, name)).toEqual([
      { typeId: 34, name: 'T34', quantity: 1000, unitM3: 0.01 },
      { typeId: 99, name: 'T99', quantity: 2, unitM3: 10 },
    ]);
  });

  it('leaves out over-limit stacks and carries each stack price', () => {
    const limited = {
      ...plan,
      active: {
        pickups: [
          {
            characterId: 1,
            locationId: 7,
            hauls: [],
            unfit: [],
            overLimit: [{ typeId: 99, quantity: 3, unitM3: 10, unitIsk: 900 }],
            tooBigShips: [],
          },
        ],
      },
    } as unknown as MovePlan;
    expect(
      carriableStacks(limited, 1, 7, lines, name, new Map([[34, 5]])).map((x) => [
        x.typeId,
        x.quantity,
        x.unitIsk,
      ])
    ).toEqual([
      [34, 1000, 5],
      [648, 2, undefined],
    ]);
  });

  it('lists every known stack when no hauler is chosen', () => {
    expect(
      carriableStacks({ ...plan, active: null }, 1, 7, lines, name).map((s) => s.typeId)
    ).toEqual([34, 648, 99]);
  });
});

describe('sectionRouteHref', () => {
  const stop = (systemId: number | null, stationId: number | null) => ({
    systemId,
    stationId,
    name: 'X',
  });
  const leg = (to: HaulLeg['to']): HaulLeg => ({
    id: 0,
    characterId: 1,
    trip: 1,
    kind: 'pickup',
    from: null,
    to,
    jumps: 1,
    m3: 1,
    locationId: null,
  });

  it('chains every stop in order from where the route starts', () => {
    const href = sectionRouteHref(
      [leg(stop(2, 22)), leg(stop(null, null)), leg(stop(3, null))],
      stop(1, null)
    )!;
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('from')).toBe('1');
    expect(params.get('stops')).toBe('2:22,3');
  });

  it('has no link when no stop has a system', () => {
    expect(sectionRouteHref([leg(stop(null, null))], null)).toBeNull();
  });
});
