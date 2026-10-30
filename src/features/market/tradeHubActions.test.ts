import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { useHubByCharacter } from './characterHubs';
import { useDefaultMarketHub } from './hub';
import {
  applyDefaultHubToAll,
  changeDefaultHub,
  dropCharacterHubEntry,
  setOneCharacterHub,
} from './tradeHubActions';

beforeEach(async () => {
  await db.settings.clear();
  useDefaultMarketHub.setState({ value: 'jita', hydrated: true });
  useHubByCharacter.setState({ value: {}, hydrated: true });
});

describe('changeDefaultHub', () => {
  it('freezes local characters without an entry at the old default first', async () => {
    useHubByCharacter.setState({ value: { 2: 'hek' } });
    await changeDefaultHub('amarr', [1, 2, 3]);
    expect(useDefaultMarketHub.getState().value).toBe('amarr');
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'jita', 2: 'hek', 3: 'jita' });
  });

  it('with one character, moves them with the default', async () => {
    useHubByCharacter.setState({ value: { 1: 'hek' } });
    await changeDefaultHub('amarr', [1]);
    expect(useDefaultMarketHub.getState().value).toBe('amarr');
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'amarr' });
  });

  it('with one character and no entry, writes only the default', async () => {
    await changeDefaultHub('amarr', [1]);
    expect(useHubByCharacter.getState().value).toEqual({});
    expect(await db.settings.get('sync.marketHub')).toMatchObject({ value: 'amarr' });
  });
});

describe('per-character edits', () => {
  it('sets one, applies the default to all, drops one', async () => {
    useHubByCharacter.setState({ value: { 9: 'rens' } });
    await setOneCharacterHub(1, 'hek');
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'hek', 9: 'rens' });
    await applyDefaultHubToAll([1, 2]);
    expect(useHubByCharacter.getState().value).toEqual({ 1: 'jita', 2: 'jita', 9: 'rens' });
    await dropCharacterHubEntry(1);
    expect(useHubByCharacter.getState().value).toEqual({ 2: 'jita', 9: 'rens' });
    expect((await db.settings.get('sync.marketHubByCharacter'))?.value).toEqual({
      2: 'jita',
      9: 'rens',
    });
  });

  it('writes nothing when there is nothing to drop', async () => {
    await dropCharacterHubEntry(5);
    expect(await db.settings.get('sync.marketHubByCharacter')).toBeUndefined();
  });
});
