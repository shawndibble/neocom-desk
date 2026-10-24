import { describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { HaulLeg } from '@/engine/route/haulPlan';
import { legRouteHref, useActiveHaul, type ActiveHaul } from './activeHaul';

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
