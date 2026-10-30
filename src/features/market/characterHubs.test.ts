import { describe, expect, it } from 'vitest';
import {
  applyDefaultToAll,
  dropCharacterHub,
  fillMissingHubs,
  hubCounts,
  parseHubMap,
  resolveTradeHub,
  setCharacterHub,
} from './characterHubs';

describe('resolveTradeHub', () => {
  it('uses the character entry, else the default', () => {
    const map = { 1: 'hek' } as const;
    expect(resolveTradeHub(map, 1, 'jita')).toBe('hek');
    expect(resolveTradeHub(map, 2, 'jita')).toBe('jita');
  });
  it('uses the default with no character', () => {
    expect(resolveTradeHub({ 1: 'hek' }, null, 'amarr')).toBe('amarr');
  });
});

describe('parseHubMap', () => {
  it('keeps good entries and drops bad ones one by one', () => {
    expect(parseHubMap({ '1': 'hek', x: 'jita', '2': 'nowhere', '3': 4, '4': 'amarr' })).toEqual({
      1: 'hek',
      4: 'amarr',
    });
  });
  it('rejects a non-object', () => {
    expect(parseHubMap('jita')).toBeNull();
    expect(parseHubMap(null)).toBeNull();
    expect(parseHubMap([])).toBeNull();
  });
});

describe('map edits', () => {
  it('sets one character without touching the others', () => {
    expect(setCharacterHub({ 1: 'jita', 9: 'rens' }, 1, 'hek')).toEqual({ 1: 'hek', 9: 'rens' });
  });
  it('drops one character and keeps entries for characters not on this device', () => {
    expect(dropCharacterHub({ 1: 'jita', 9: 'rens' }, 1)).toEqual({ 9: 'rens' });
  });
  it('fills only the missing local characters', () => {
    expect(fillMissingHubs({ 1: 'hek' }, [1, 2], 'jita')).toEqual({ 1: 'hek', 2: 'jita' });
  });
  it('apply to all sets every local character and keeps the rest', () => {
    expect(applyDefaultToAll({ 1: 'hek', 9: 'rens' }, [1, 2], 'amarr')).toEqual({
      1: 'amarr',
      2: 'amarr',
      9: 'rens',
    });
  });
});

describe('hubCounts', () => {
  it('counts resolved hubs, biggest first', () => {
    expect(hubCounts({ 2: 'hek', 3: 'amarr' }, [1, 2, 3, 4], 'jita')).toEqual([
      ['jita', 2],
      ['amarr', 1],
      ['hek', 1],
    ]);
  });
});
