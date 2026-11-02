import { describe, it, expect, vi } from 'vitest';
import type { FoundPlace } from '@/features/places/useKnownPlaces';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import { createPlacesProvider, type PlacesProviderOptions } from './placesProvider';

const signal = new AbortController().signal;

const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 },
  { id: 30002187, name: 'Amarr', security: 1, regionId: 10000043 },
  { id: 30002659, name: 'Dodixie', security: 0.9, regionId: 10000032 },
];
const JITA_4_4: FoundPlace = {
  kind: 'station',
  id: 60003760,
  name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  systemId: 30000142,
};
const STRUCTURE: FoundPlace = {
  kind: 'structure',
  id: 1_000_000_000_001,
  name: 'Perimeter - Tranquility Trading Tower',
  systemId: 30000142,
};

function provider(overrides: Partial<PlacesProviderOptions> = {}) {
  return createPlacesProvider({
    loadSystems: () => Promise.resolve(SYSTEMS),
    searchPlaces: () => Promise.resolve([]),
    nicknames: () => ({}),
    resolvePlace: () => Promise.resolve(null),
    openRoute: vi.fn(),
    setWaypoint: vi.fn(() => Promise.resolve(null)),
    waypointLabel: 'Set waypoint',
    describeSystem: (system) => `System ${system.security}`,
    describeStation: ({ name, systemName }, nickname) =>
      [nickname === undefined ? null : name, systemName].filter(Boolean).join(' · '),
    ...overrides,
  });
}

describe('createPlacesProvider', () => {
  it('finds a system and opens the route to it', async () => {
    const openRoute = vi.fn();
    const [row] = await provider({ openRoute }).search('amarr', signal);
    expect(row.label).toBe('Amarr');
    row.run();
    expect(openRoute).toHaveBeenCalledWith(30002187, null);
  });

  it('Shift+Enter action sets the waypoint for the system', async () => {
    const setWaypoint = vi.fn(() => Promise.resolve(null));
    const [row] = await provider({ setWaypoint }).search('dodixie', signal);
    await row.altAction?.run();
    expect(setWaypoint).toHaveBeenCalledWith(30002659, 'Dodixie');
  });

  it('lists a stored station with its system and routes to that system naming the station', async () => {
    const openRoute = vi.fn();
    const [row] = await provider({
      openRoute,
      searchPlaces: () => Promise.resolve([JITA_4_4]),
    }).search('jita iv', signal);
    expect(row.label).toBe(JITA_4_4.name);
    expect(row.sublabel).toBe('Jita');
    row.run();
    expect(openRoute).toHaveBeenCalledWith(30000142, 60003760);
  });

  it('finds a known structure and waypoints the structure itself', async () => {
    const setWaypoint = vi.fn(() => Promise.resolve(null));
    const results = await provider({
      setWaypoint,
      searchPlaces: () => Promise.resolve([STRUCTURE]),
    }).search('trading tower', signal);
    await results[0].altAction?.run();
    expect(setWaypoint).toHaveBeenCalledWith(STRUCTURE.id, STRUCTURE.name);
  });

  it('matches a Place Nickname, leading with it and keeping the real name beneath', async () => {
    const [row] = await provider({
      nicknames: () => ({ 60003760: 'Home Market' }),
      resolvePlace: () => Promise.resolve({ name: JITA_4_4.name, systemId: 30000142 }),
    }).search('home mark', signal);
    expect(row.label).toBe('Home Market');
    expect(row.sublabel).toBe(`${JITA_4_4.name} · Jita`);
  });

  it('shows one row when the nickname and the real name match the same place', async () => {
    const results = await provider({
      nicknames: () => ({ 60003760: 'Jita Hub' }),
      searchPlaces: () => Promise.resolve([JITA_4_4]),
      resolvePlace: () => Promise.resolve({ name: JITA_4_4.name, systemId: 30000142 }),
    }).search('jita', signal);
    expect(results.filter((r) => r.id === 'station:60003760')).toHaveLength(1);
    expect(results.find((r) => r.id === 'station:60003760')?.label).toBe('Jita Hub');
  });

  it('drops a nicknamed place that cannot be named', async () => {
    const results = await provider({ nicknames: () => ({ 1: 'Secret' }) }).search('secret', signal);
    expect(results).toEqual([]);
  });

  it('lists systems before the stations that share their name', async () => {
    const withPlace = provider({ searchPlaces: () => Promise.resolve([JITA_4_4]) });
    const ids = (await withPlace.search('jita', signal)).map((r) => r.id);
    expect(ids).toEqual(['system:30000142', 'station:60003760']);
  });

  it('finds a station by its own name once the query is specific', async () => {
    const withPlace = provider({ searchPlaces: () => Promise.resolve([JITA_4_4]) });
    expect((await withPlace.search('jita iv', signal))[0].id).toBe('station:60003760');
  });

  it('leaves stations out of a short query and never asks for them', async () => {
    const searchPlaces = vi.fn(() => Promise.resolve([JITA_4_4]));
    const results = await provider({ searchPlaces }).search('jit', signal);
    expect(results.map((r) => r.id)).toEqual(['system:30000142']);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('leaves out stations that only contain the query mid-name', async () => {
    const results = await provider({ searchPlaces: () => Promise.resolve([JITA_4_4]) }).search(
      'caldari',
      signal
    );
    expect(results).toEqual([]);
  });

  it('keeps a nicknamed place whatever the query length', async () => {
    const [row] = await provider({
      nicknames: () => ({ 60003760: 'Hub' }),
      resolvePlace: () => Promise.resolve({ name: JITA_4_4.name, systemId: 30000142 }),
    }).search('hu', signal);
    expect(row.label).toBe('Hub');
  });

  it('needs two characters and sits between Assets and LP Stores', () => {
    const p = provider();
    expect(p.minQueryLength).toBe(2);
    expect(p.order).toBeGreaterThan(3);
    expect(p.order).toBeLessThan(5);
  });
});
