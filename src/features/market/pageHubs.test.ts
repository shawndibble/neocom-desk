import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHubByCharacter } from './characterHubs';
import {
  loadHubFor,
  pickHubFor,
  setHubScope,
  tradeHubIdFor,
  useDefaultMarketHub,
  useGlobalClosest,
  useMarketHub,
} from './hub';
import { useClosestHubs } from './closestHub';
import { dropPageHub, ownChoice, parsePageHubs, setPageHub, usePageHubs } from './pageHubs';

describe('parsePageHubs', () => {
  it('keeps every entry as stored, even one this build cannot read, so writing it back loses nothing', () => {
    expect(parsePageHubs({ contracts: 'amarr', moonbase: 'jita', market: 'closest' })).toEqual({
      contracts: 'amarr',
      moonbase: 'jita',
      market: 'closest',
    });
    expect(parsePageHubs({ contracts: 3 })).toEqual({});
  });

  it('rejects a value that is not a map', () => {
    expect(parsePageHubs('jita')).toBeNull();
    expect(parsePageHubs(null)).toBeNull();
    expect(parsePageHubs(['jita'])).toBeNull();
  });

  it('reads an entry only when it names a known hub or Closest; another value leaves the page on Global', () => {
    expect(ownChoice({ contracts: 'amarr' }, 'contracts')).toBe('amarr');
    expect(ownChoice({ contracts: 'closest' }, 'contracts')).toBe('closest');
    expect(ownChoice({ contracts: 'nowhere' }, 'contracts')).toBeUndefined();
    // An edit keeps what it cannot read.
    expect(setPageHub({ moonbase: 'jita' }, 'contracts', 'hek')).toEqual({
      moonbase: 'jita',
      contracts: 'hek',
    });
  });
});

describe('page hub edits', () => {
  it('sets and drops an entry', () => {
    const map = setPageHub({}, 'contracts', 'rens');
    expect(map).toEqual({ contracts: 'rens' });
    expect(dropPageHub(map, 'contracts')).toEqual({});
    expect(dropPageHub({}, 'contracts')).toEqual({});
  });
});

async function reset(rows: { key: string; value: unknown }[]) {
  await db.settings.clear();
  await db.settings.bulkPut(rows);
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
  usePageHubs.setState({ value: {}, hydrated: false });
  useGlobalClosest.setState({ value: false, hydrated: false });
  useClosestHubs.setState({ byCharacter: {} });
}

/** Character 91 is active and its Closest hub already worked out (`null`: no location). */
async function activeAt(closest: 'amarr' | 'hek' | null) {
  await db.settings.put({ key: 'activeCharacterId', value: 91 });
  useActiveCharacter.setState({ activeCharacterId: 91, hydrated: true });
  useClosestHubs.setState({ byCharacter: { '91': { hubId: closest, at: Date.now() } } });
}

describe('picking a hub for a page', () => {
  beforeEach(() =>
    reset([
      { key: 'sync.marketHub', value: 'jita' },
      { key: 'sync.pageHubs', value: { contracts: 'amarr' } },
    ])
  );

  it('on its own entry, a pick moves only that page', async () => {
    await pickHubFor('contracts', 'hek');
    expect(usePageHubs.getState().value).toEqual({ contracts: 'hek' });
    expect(useMarketHub.getState().value).toBe('jita');
  });

  it('a Global hub change leaves a page with its own entry where it is', async () => {
    await usePageHubs.getState().hydrate();
    await useMarketHub.getState().setValue('dodixie');
    expect(await loadHubFor('contracts')).toBe('amarr');
    expect(await loadHubFor('fittings')).toBe('dodixie');
  });

  it('back to Global drops the entry, and a pick then moves the Global hub', async () => {
    await setHubScope('contracts', 'global');
    expect(usePageHubs.getState().value).toEqual({});
    await pickHubFor('contracts', 'rens');
    expect(useMarketHub.getState().value).toBe('rens');
    expect(usePageHubs.getState().value).toEqual({});
  });

  it('switching to the page starts it at the hub in use, so nothing re-prices', async () => {
    await setHubScope('contracts', 'global');
    await useMarketHub.getState().setValue('hek');
    await setHubScope('contracts', 'page');
    expect(usePageHubs.getState().value).toEqual({ contracts: 'hek' });
  });

  it('background jobs still read the Global hub', async () => {
    expect(await tradeHubIdFor(null)).toBe('jita');
  });
});

describe('Closest hub', () => {
  beforeEach(() => reset([{ key: 'sync.marketHub', value: 'jita' }]));

  it("a page's Closest entry prices at the hub nearest the active Character", async () => {
    await activeAt('hek');
    await usePageHubs.getState().setValue({ contracts: 'closest' });
    expect(await loadHubFor('contracts')).toBe('hek');
    expect(await loadHubFor('fittings')).toBe('jita');
  });

  it('falls back to the Global hub with no location', async () => {
    await activeAt(null);
    await usePageHubs.getState().setValue({ contracts: 'closest' });
    expect(await loadHubFor('contracts')).toBe('jita');
  });

  it('Closest on Global moves every page without an entry, and keeps the stored hub as its fallback', async () => {
    await activeAt('amarr');
    await usePageHubs.getState().setValue({ contracts: 'rens' });
    await pickHubFor('fittings', 'closest');
    expect(useGlobalClosest.getState().value).toBe(true);
    expect((await db.settings.get('sync.marketHub'))?.value).toBe('jita');
    expect(await loadHubFor('fittings')).toBe('amarr');
    expect(await loadHubFor('contracts')).toBe('rens');
    expect(await tradeHubIdFor(91)).toBe('amarr');

    // A page switched to its own hub starts on Closest too; a hub pick on Global ends Closest.
    await setHubScope('market', 'page');
    expect(usePageHubs.getState().value).toEqual({ contracts: 'rens', market: 'closest' });
    await pickHubFor('fittings', 'dodixie');
    expect(useGlobalClosest.getState().value).toBe(false);
    expect(await loadHubFor('fittings')).toBe('dodixie');
  });
});
