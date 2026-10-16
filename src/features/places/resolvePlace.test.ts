import { describe, expect, it } from 'vitest';
import { classifyPlaceId, classifyPlaceInfoId, placeKey } from './classify';
import { resolvePlace } from './resolve';
import { memoryPlaceSource } from './testSource';

const STRUCTURE = 1_030_000_000_000;
const source = () =>
  memoryPlaceSource({
    stations: { 60003760: { name: 'Jita IV - Moon 4', systemId: 30000142 } },
    structures: { [`7:${STRUCTURE}`]: { name: 'Fort', systemId: 30002187 } },
    systems: { 30000142: { name: 'Jita', security: 0.95 } },
  });

describe('classifyPlaceId', () => {
  it('splits by CCP id block', () => {
    expect(classifyPlaceId(30000142)).toBe('solar_system');
    expect(classifyPlaceId(60003760)).toBe('station');
    expect(classifyPlaceId(STRUCTURE)).toBe('structure');
    expect(classifyPlaceId(12345)).toBeNull();
  });
});

describe('classifyPlaceInfoId', () => {
  it('adds regions to the Place blocks', () => {
    expect(classifyPlaceInfoId(10000002)).toBe('region');
    expect(classifyPlaceInfoId(11000001)).toBe('region');
    expect(classifyPlaceInfoId(12000001)).toBe('region');
    expect(classifyPlaceInfoId(14000001)).toBe('region');
    expect(classifyPlaceInfoId(60003760)).toBe('station');
    expect(classifyPlaceInfoId(STRUCTURE)).toBe('structure');
    expect(classifyPlaceInfoId(30000142)).toBe('solar_system');
  });

  it('is null for a constellation or any other id', () => {
    expect(classifyPlaceInfoId(20000020)).toBeNull();
    expect(classifyPlaceInfoId(500001)).toBeNull();
  });
});

describe('placeKey', () => {
  it('is per asking Character', () => {
    expect(placeKey({ locationId: 5, characterId: 1 })).not.toBe(
      placeKey({ locationId: 5, characterId: 2 })
    );
  });
});

describe('resolvePlace', () => {
  it('a solar system is its own system and is named by the system read', async () => {
    expect(await resolvePlace({ locationId: 30000142, characterId: 7 }, source())).toEqual({
      name: 'Jita',
      systemId: 30000142,
    });
  });

  it('a station reads the station name and system', async () => {
    expect(
      await resolvePlace({ locationId: 60003760, characterId: null, kind: 'station' }, source())
    ).toEqual({ name: 'Jita IV - Moon 4', systemId: 30000142 });
  });

  it('a structure goes through the asking Character', async () => {
    const s = source();
    expect(await resolvePlace({ locationId: STRUCTURE, characterId: 7 }, s)).toEqual({
      name: 'Fort',
      systemId: 30002187,
    });
    expect(s.calls).toContain(`structureSystemId:7:${STRUCTURE}`);
  });

  it('a structure another Character cannot see is unresolved, never borrowed', async () => {
    expect(await resolvePlace({ locationId: STRUCTURE, characterId: 8 }, source())).toEqual({
      name: null,
      systemId: null,
    });
  });

  it('a structure with no Character, and an id that is no place, resolve to nothing', async () => {
    const s = source();
    expect(await resolvePlace({ locationId: STRUCTURE, characterId: null }, s)).toEqual({
      name: null,
      systemId: null,
    });
    expect(await resolvePlace({ locationId: 12345, characterId: 7 }, s)).toEqual({
      name: null,
      systemId: null,
    });
    expect(s.calls).toEqual([]);
  });

  it('the caller kind wins over the id: an orphan item that is really a structure', async () => {
    // An item-parented location whose id sits below the Upwell floor would
    // classify as no place; the caller that resolved its name says structure.
    const orphan = 1_000_000_000;
    const s = memoryPlaceSource({
      structures: { [`7:${orphan}`]: { name: 'Odd', systemId: 30000001 } },
    });
    expect(await resolvePlace({ locationId: orphan, characterId: 7 }, s)).toEqual({
      name: null,
      systemId: null,
    });
    expect(
      await resolvePlace({ locationId: orphan, characterId: 7, kind: 'structure' }, s)
    ).toEqual({
      name: 'Odd',
      systemId: 30000001,
    });
  });

  it('name: false reads only the system', async () => {
    const s = source();
    const place = await resolvePlace({ locationId: 60003760, characterId: 7 }, s, { name: false });
    expect(place).toEqual({ name: null, systemId: 30000142 });
    expect(s.calls).toEqual(['stationSystemId:60003760']);
  });

  it('settle: a failed name read keeps the system, and a failed system read keeps the name', async () => {
    const failing = { ...source() };
    failing.stationName = () => Promise.reject(new Error('boom'));
    const ref = { locationId: 60003760, characterId: 7 };
    expect(await resolvePlace(ref, failing, { settle: true })).toEqual({
      name: null,
      systemId: 30000142,
    });
    const noSystem = { ...source() };
    noSystem.stationSystemId = () => Promise.reject(new Error('boom'));
    expect(await resolvePlace(ref, noSystem, { settle: true })).toEqual({
      name: 'Jita IV - Moon 4',
      systemId: null,
    });
  });

  it('without settle a throwing read propagates', async () => {
    const failing = { ...source() };
    failing.stationName = () => Promise.reject(new Error('boom'));
    await expect(resolvePlace({ locationId: 60003760, characterId: 7 }, failing)).rejects.toThrow(
      'boom'
    );
  });
});
