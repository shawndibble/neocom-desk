import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import { placeKey } from './classify';
import { memoryPlaceSource } from './testSource';
import { usePlaceDetails } from './usePlaceDetails';

const jumpsBetween = vi.fn();
vi.mock('@/features/route/jumpBasis', () => ({
  jumpsBetween: (...args: unknown[]) => jumpsBetween(...args),
}));

const STRUCTURE = 1_030_000_000_000;
const basis = { rules: {}, network: {}, key: 'b1', hydrated: true } as never;
const known = (jumps: number): JumpsAwayResult => ({ kind: 'known', jumps });

function setup() {
  return memoryPlaceSource({
    stations: { 60003760: { name: 'Jita IV', systemId: 30000142 } },
    structures: { [`1:${STRUCTURE}`]: { name: 'Fort', systemId: 30002187 } },
    systems: { 30000142: { security: 0.95 }, 30002187: { security: 0.3 } },
  });
}
const station = { locationId: 60003760, characterId: 1, kind: 'station' as const };
const structure = { locationId: STRUCTURE, characterId: 1, kind: 'structure' as const };

describe('usePlaceDetails', () => {
  beforeEach(() => {
    jumpsBetween.mockReset();
    jumpsBetween.mockImplementation(async (_o: number, d: number) => known(d === 30000142 ? 3 : 9));
  });

  it('resolves name, system, security and jumps for each Place', async () => {
    const source = setup();
    const { result } = renderHook(() =>
      usePlaceDetails([station, structure], {
        scopeId: 1,
        origin: { systemId: 30000001, resolved: true },
        basis,
        source,
      })
    );
    await waitFor(() => expect(result.current.get(placeKey(structure))?.jumps).toEqual(known(9)));
    expect(result.current.get(placeKey(station))).toEqual({
      name: 'Jita IV',
      systemId: 30000142,
      security: 0.95,
      jumps: known(3),
    });
  });

  it('lands every Place of a long list, each with its name and security', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => 60_000_000 + i);
    const memory = memoryPlaceSource({
      stations: Object.fromEntries(ids.map((id) => [id, { name: `S${id}`, systemId: 30000142 }])),
      systems: { 30000142: { security: 0.95 } },
    });
    // Real ESI answers land on separate macrotasks, so React cannot merge them.
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    const source = {
      ...memory,
      stationName: async (id: number) => (await tick(), memory.stationName(id)),
      stationSystemId: async (id: number) => (await tick(), memory.stationSystemId(id)),
    } as typeof memory;
    const refs = ids.map((locationId) => ({
      locationId,
      characterId: 1,
      kind: 'station' as const,
    }));
    const { result } = renderHook(() => {
      return usePlaceDetails(refs, { scopeId: 1, origin: null, basis: null, source });
    });
    await waitFor(() => expect(result.current.get(placeKey(refs[49]))?.security).toBe(0.95));
    expect(result.current.get(placeKey(refs[0]))?.name).toBe('S60000000');
    expect(result.current.get(placeKey(refs[49]))?.name).toBe('S60000049');
  });

  it('reads a Place once however often it rerenders, and a system once for two Places', async () => {
    const source = setup();
    const second = { locationId: 60003761, characterId: 1, kind: 'station' as const };
    const s2 = memoryPlaceSource({
      stations: {
        60003760: { systemId: 30000142 },
        60003761: { systemId: 30000142 },
      },
      systems: { 30000142: { security: 0.95 } },
    });
    const { result, rerender } = renderHook(
      ({ refs }) =>
        usePlaceDetails(refs, {
          scopeId: 1,
          origin: { systemId: 30000001, resolved: true },
          basis,
          source: s2,
        }),
      { initialProps: { refs: [station, second] } }
    );
    await waitFor(() => expect(result.current.get(placeKey(second))?.jumps).toBeDefined());
    // A new array identity with the same Places is not a new request.
    rerender({ refs: [{ ...station }, { ...second }] });
    await act(async () => {});
    expect(s2.calls.filter((c) => c === 'systemSecurity:30000142')).toHaveLength(1);
    expect(s2.calls.filter((c) => c.startsWith('stationSystemId'))).toHaveLength(2);
    expect(source.calls).toEqual([]);
  });

  it('names: false never reads a name', async () => {
    const source = setup();
    renderHook(() =>
      usePlaceDetails([station], { scopeId: 1, origin: null, basis: null, names: false, source })
    );
    await waitFor(() => expect(source.calls).toContain('systemSecurity:30000142'));
    expect(source.calls.some((c) => c.startsWith('stationName'))).toBe(false);
  });

  it('no origin is noLocation, no system is noRoute; both skip the route call', async () => {
    const source = memoryPlaceSource({});
    const lost = renderHook(() =>
      usePlaceDetails([structure], {
        scopeId: 1,
        origin: { systemId: null, resolved: true },
        basis,
        source,
      })
    );
    await waitFor(() =>
      expect(lost.result.current.get(placeKey(structure))?.jumps).toEqual({
        kind: 'unknown',
        reason: 'noLocation',
      })
    );
    const unplaced = renderHook(() =>
      usePlaceDetails([structure], {
        scopeId: 1,
        origin: { systemId: 30000001, resolved: true },
        basis,
        source,
      })
    );
    await waitFor(() =>
      expect(unplaced.result.current.get(placeKey(structure))?.jumps).toEqual({
        kind: 'unknown',
        reason: 'noRoute',
      })
    );
    expect(jumpsBetween).not.toHaveBeenCalled();
  });

  it('waits for the origin and the basis before counting anything', async () => {
    const source = setup();
    const { result, rerender } = renderHook(
      ({ resolved }) =>
        usePlaceDetails([station], {
          scopeId: 1,
          origin: { systemId: 30000001, resolved },
          basis,
          source,
        }),
      { initialProps: { resolved: false } }
    );
    await waitFor(() => expect(result.current.get(placeKey(station))?.security).toBe(0.95));
    expect(result.current.get(placeKey(station))?.jumps).toBeUndefined();
    expect(jumpsBetween).not.toHaveBeenCalled();
    rerender({ resolved: true });
    await waitFor(() => expect(result.current.get(placeKey(station))?.jumps).toEqual(known(3)));
  });

  it('a new basis recounts and never shows the old count', async () => {
    const source = setup();
    const { result, rerender } = renderHook(
      ({ b }) =>
        usePlaceDetails([station], {
          scopeId: 1,
          origin: { systemId: 30000001, resolved: true },
          basis: b,
          source,
        }),
      { initialProps: { b: basis } }
    );
    await waitFor(() => expect(result.current.get(placeKey(station))?.jumps).toEqual(known(3)));
    jumpsBetween.mockImplementation(async () => known(5));
    rerender({ b: { ...(basis as object), key: 'b2' } as never });
    expect(result.current.get(placeKey(station))?.jumps).toBeUndefined();
    await waitFor(() => expect(result.current.get(placeKey(station))?.jumps).toEqual(known(5)));
  });

  it('an unrelated rerender mid-flight does not discard the result', async () => {
    let release!: (v: number | null) => void;
    const source = setup();
    source.stationSystemId = () => new Promise((r) => (release = r));
    const { result, rerender } = renderHook(
      ({ refs }) => usePlaceDetails(refs, { scopeId: 1, origin: null, basis: null, source }),
      { initialProps: { refs: [station] } }
    );
    rerender({ refs: [{ ...station }] });
    await act(async () => release(30000142));
    await waitFor(() => expect(result.current.get(placeKey(station))?.systemId).toBe(30000142));
  });

  it('a character switch drops the old Character result and asks again for the new one', async () => {
    let release!: (v: number | null) => void;
    const source = setup();
    source.structureSystemId = (c) =>
      c === 1 ? new Promise((r) => (release = r)) : Promise.resolve(c === 2 ? 30002187 : null);
    const { result, rerender } = renderHook(
      ({ scopeId }) =>
        usePlaceDetails([{ locationId: STRUCTURE, characterId: scopeId, kind: 'structure' }], {
          scopeId,
          origin: null,
          basis: null,
          source,
        }),
      { initialProps: { scopeId: 1 } }
    );
    rerender({ scopeId: 2 });
    await waitFor(() =>
      expect(
        result.current.get(placeKey({ locationId: STRUCTURE, characterId: 2 }))?.systemId
      ).toBe(30002187)
    );
    // The first Character's slow answer lands late and must not leak in.
    await act(async () => release(30000142));
    expect(result.current.get(placeKey({ locationId: STRUCTURE, characterId: 2 }))?.systemId).toBe(
      30002187
    );
    expect(result.current.get(placeKey({ locationId: STRUCTURE, characterId: 1 }))).toBeUndefined();
  });

  it('bounds the fan-out', async () => {
    const refs = Array.from({ length: 30 }, (_, i) => ({
      locationId: 60000000 + i,
      characterId: 1,
      kind: 'station' as const,
    }));
    let inFlight = 0;
    let peak = 0;
    const source = setup();
    source.stationSystemId = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return 30000142;
    };
    const { result } = renderHook(() =>
      usePlaceDetails(refs, { scopeId: 1, origin: null, basis: null, names: false, source })
    );
    await waitFor(() => expect(result.current.get(placeKey(refs[29]))?.systemId).toBe(30000142));
    expect(peak).toBeLessThanOrEqual(10);
  });

  it('enabled: false reads nothing', async () => {
    const source = setup();
    renderHook(() =>
      usePlaceDetails([station], {
        scopeId: null,
        enabled: false,
        origin: null,
        basis: null,
        source,
      })
    );
    await act(async () => {});
    expect(source.calls).toEqual([]);
  });

  it('refs without a Character ask as the scope Character, and follow it on a switch with the same Places', async () => {
    const source = memoryPlaceSource({
      structures: {
        [`1:${STRUCTURE}`]: { systemId: 30002187 },
        [`2:${STRUCTURE}`]: { systemId: 30000142 },
      },
      systems: { 30000142: { security: 0.95 }, 30002187: { security: 0.3 } },
    });
    const refs = [{ locationId: STRUCTURE, kind: 'structure' as const }];
    const { result, rerender } = renderHook(
      ({ scopeId }) => usePlaceDetails(refs, { scopeId, origin: null, basis: null, source }),
      { initialProps: { scopeId: 1 } }
    );
    const key = (characterId: number) => placeKey({ locationId: STRUCTURE, characterId });
    await waitFor(() => expect(result.current.get(key(1))?.security).toBe(0.3));
    rerender({ scopeId: 2 });
    await waitFor(() => expect(result.current.get(key(2))?.security).toBe(0.95));
    expect(result.current.get(key(1))).toBeUndefined();
  });

  it('a failed name read keeps the system, security and jumps', async () => {
    const source = setup();
    source.stationName = () => Promise.reject(new Error('name down'));
    const { result } = renderHook(() =>
      usePlaceDetails([station], {
        scopeId: 1,
        origin: { systemId: 30000001, resolved: true },
        basis,
        source,
      })
    );
    await waitFor(() => expect(result.current.get(placeKey(station))?.jumps).toEqual(known(3)));
    expect(result.current.get(placeKey(station))).toMatchObject({
      name: null,
      systemId: 30000142,
      security: 0.95,
    });
  });
});
