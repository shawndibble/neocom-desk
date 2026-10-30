import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useHubByCharacter } from './characterHubs';
import { tradeHubIdFor, useDefaultMarketHub, useMarketHub } from './hub';

async function reset(rows: { key: string; value: unknown }[]) {
  await db.settings.clear();
  await db.settings.bulkPut(rows);
  useDefaultMarketHub.setState({ value: 'jita', hydrated: false });
  useHubByCharacter.setState({ value: {}, hydrated: false });
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  useMarketHub.setState({ value: 'jita', hydrated: false });
}

describe('useMarketHub: the hub in force', () => {
  beforeEach(() =>
    reset([
      { key: 'sync.marketHub', value: 'amarr' },
      { key: 'sync.marketHubByCharacter', value: { '1': 'hek' } },
      { key: 'activeCharacterId', value: 1 },
    ])
  );

  it("is the active character's hub", async () => {
    await useMarketHub.getState().hydrate();
    expect(useMarketHub.getState()).toMatchObject({ value: 'hek', hydrated: true });
  });

  it('is the default for a character with no entry, and with no active character', async () => {
    await useMarketHub.getState().hydrate();
    await useActiveCharacter.getState().setActiveCharacter(2);
    expect(useMarketHub.getState().value).toBe('amarr');
    await useActiveCharacter.getState().clearActiveCharacter();
    expect(useMarketHub.getState().value).toBe('amarr');
  });

  it('follows the active character as it switches', async () => {
    await useMarketHub.getState().hydrate();
    await useActiveCharacter.getState().setActiveCharacter(2);
    await useActiveCharacter.getState().setActiveCharacter(1);
    expect(useMarketHub.getState().value).toBe('hek');
  });

  it("writes the active character's entry, leaving the default alone", async () => {
    await useMarketHub.getState().hydrate();
    await useMarketHub.getState().setValue('rens');
    expect(useMarketHub.getState().value).toBe('rens');
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'rens' });
    expect(useDefaultMarketHub.getState().value).toBe('amarr');
    expect((await db.settings.get('sync.marketHubByCharacter'))?.value).toEqual({ 1: 'rens' });
  });

  it('writes the default with no active character', async () => {
    await useMarketHub.getState().hydrate();
    await useActiveCharacter.getState().clearActiveCharacter();
    await useMarketHub.getState().setValue('dodixie');
    expect(useDefaultMarketHub.getState().value).toBe('dodixie');
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'hek' });
  });

  it('answers for any character without the active one', async () => {
    expect(await tradeHubIdFor(1)).toBe('hek');
    expect(await tradeHubIdFor(7)).toBe('amarr');
    expect(await tradeHubIdFor(null)).toBe('amarr');
  });
});
