import { describe, it, expect, vi } from 'vitest';
import { npcCorporations, probeLpStores } from './lpCorporations.mjs';

const CORP_ROWS = [
  ['corporationID', 'size', 'factionID', 'corporationName'],
  ['1000120', 'H', '500004', 'Federation Navy'],
  ['1000130', 'L', '', 'Sisters of EVE'],
  ['1000001', 'T', '', 'Doomheim'],
  // A short or malformed row must not become a NaN id.
  [''],
  ['abc', 'L', '', 'Broken'],
];

describe('npcCorporations', () => {
  it('reads id, name and faction, leaving the faction key off for a factionless corp', () => {
    expect(npcCorporations(CORP_ROWS)).toEqual([
      { id: 1000120, name: 'Federation Navy', factionId: 500004 },
      { id: 1000130, name: 'Sisters of EVE' },
      { id: 1000001, name: 'Doomheim' },
    ]);
  });
});

describe('probeLpStores', () => {
  const corps = npcCorporations(CORP_ROWS);

  it('keeps only the corps whose store has at least one offer, sorted by name', async () => {
    const hasOffers = vi.fn(async (id) => id !== 1000001);

    const { lpCorporations } = await probeLpStores(corps, { cache: {}, hasOffers });

    expect(lpCorporations).toEqual([
      { id: 1000120, name: 'Federation Navy', factionId: 500004 },
      { id: 1000130, name: 'Sisters of EVE' },
    ]);
  });

  it('answers from the cache without probing, and caches a negative result too', async () => {
    const hasOffers = vi.fn(async () => false);
    const cache = { 1000120: true, 1000130: true };

    const result = await probeLpStores(corps, { cache, hasOffers });

    expect(hasOffers).toHaveBeenCalledTimes(1);
    expect(hasOffers).toHaveBeenCalledWith(1000001);
    expect(result.cache).toEqual({ 1000120: true, 1000130: true, 1000001: false });
    expect(result.probed).toBe(1);
    expect(result.lpCorporations.map((c) => c.id)).toEqual([1000120, 1000130]);
  });

  it('does not cache a failed probe, so the next build retries it', async () => {
    const hasOffers = vi.fn(async (id) => {
      if (id === 1000130) throw new Error('HTTP 503');
      return true;
    });
    const warn = vi.fn();

    const result = await probeLpStores(corps, { cache: {}, hasOffers, warn });

    expect(result.failed).toEqual([1000130]);
    expect(result.cache).not.toHaveProperty('1000130');
    expect(result.lpCorporations.map((c) => c.id)).toEqual([1000001, 1000120]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not mutate the cache it was given', async () => {
    const cache = {};
    await probeLpStores(corps, { cache, hasOffers: async () => true });
    expect(cache).toEqual({});
  });
});
