import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SolarSystemEntry } from './marketTypes';

const SYSTEMS: SolarSystemEntry[] = [
  { id: 30000142, name: 'Jita', security: 0.9459, regionId: 10000002 },
  { id: 31000007, name: 'J105443', security: -0.99, regionId: 11000001 },
];

const loadSolarSystems = vi.fn(async (): Promise<SolarSystemEntry[]> => SYSTEMS);
vi.mock('./loadMarketSde', () => ({
  loadSolarSystems: () => loadSolarSystems(),
}));

import {
  clearSolarSystemIndex,
  loadSolarSystemsByName,
  lookupSolarSystem,
  lookupSolarSystemByName,
} from './solarSystems';

beforeEach(() => {
  clearSolarSystemIndex();
  loadSolarSystems.mockReset();
  loadSolarSystems.mockResolvedValue(SYSTEMS);
});

describe('lookupSolarSystem', () => {
  it('answers with the entry for an id the snapshot holds', async () => {
    expect(await lookupSolarSystem(30000142)).toEqual({
      id: 30000142,
      name: 'Jita',
      security: 0.9459,
      regionId: 10000002,
    });
  });

  it('answers null for an id a loaded snapshot does not hold', async () => {
    expect(await lookupSolarSystem(1)).toBeNull();
  });

  it('answers undefined when the snapshot itself cannot be read', async () => {
    loadSolarSystems.mockRejectedValue(new Error('offline'));

    expect(await lookupSolarSystem(30000142)).toBeUndefined();
  });

  it('indexes the snapshot once, however many ids are asked for', async () => {
    await Promise.all([30000142, 31000007, 1, 30000142].map(lookupSolarSystem));

    expect(loadSolarSystems).toHaveBeenCalledTimes(1);
  });

  it('retries the snapshot after a failure instead of memoizing the failure', async () => {
    loadSolarSystems.mockRejectedValueOnce(new Error('offline'));
    expect(await lookupSolarSystem(30000142)).toBeUndefined();

    expect((await lookupSolarSystem(30000142))?.name).toBe('Jita');
  });
});

describe('lookupSolarSystemByName', () => {
  it('finds a system by name, ignoring case and surrounding space', async () => {
    expect((await lookupSolarSystemByName('  jita '))?.id).toBe(30000142);
    expect((await lookupSolarSystemByName('J105443'))?.regionId).toBe(11000001);
  });

  it('answers null for a name a loaded snapshot does not hold', async () => {
    expect(await lookupSolarSystemByName('Nowhere')).toBeNull();
  });

  it('answers undefined when the snapshot itself cannot be read', async () => {
    loadSolarSystems.mockRejectedValue(new Error('offline'));

    expect(await lookupSolarSystemByName('Jita')).toBeUndefined();
    expect(await loadSolarSystemsByName()).toBeNull();
  });
});
