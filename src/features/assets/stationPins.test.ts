import { describe, it, expect } from 'vitest';
import type { StationPinRecord } from '@/db';
import { nextPinState, pinStateForStation } from './stationPins';

function pin(
  characterId: number,
  locationId: number,
  scope: StationPinRecord['scope']
): StationPinRecord {
  return { id: `${characterId}:${locationId}`, characterId, locationId, scope, updatedAt: 1 };
}

describe('nextPinState', () => {
  it('cycles unpinned -> character -> account -> unpinned', () => {
    expect(nextPinState('unpinned')).toBe('character');
    expect(nextPinState('character')).toBe('account');
    expect(nextPinState('account')).toBe('unpinned');
  });
});

describe('pinStateForStation', () => {
  it('is unpinned when no pin record matches the station', () => {
    expect(pinStateForStation([], 1, 100)).toBe('unpinned');
    expect(pinStateForStation([pin(1, 999, 'character')], 1, 100)).toBe('unpinned');
  });

  it('is character-scoped only while that exact character is active', () => {
    const pins = [pin(1, 100, 'character')];
    expect(pinStateForStation(pins, 1, 100)).toBe('character');
    expect(pinStateForStation(pins, 2, 100)).toBe('unpinned');
  });

  it('is account-wide for every character once any character holds an account pin', () => {
    const pins = [pin(1, 100, 'account')];
    expect(pinStateForStation(pins, 1, 100)).toBe('account');
    expect(pinStateForStation(pins, 2, 100)).toBe('account');
  });

  it('an account pin from a different station does not elevate this one', () => {
    const pins = [pin(1, 999, 'account'), pin(2, 100, 'character')];
    expect(pinStateForStation(pins, 2, 100)).toBe('character');
  });
});
