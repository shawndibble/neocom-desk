import { describe, it, expect } from 'vitest';
import {
  parseCharacterFilterPicks,
  pickedCharacterFilter,
  withCharacterFilterPick,
} from './characterFilterPicks';

describe('pickedCharacterFilter', () => {
  it('uses the page pick over the Settings default', () => {
    expect(pickedCharacterFilter({ assets: 'all' }, 'assets', 'current')).toBe('all');
    expect(pickedCharacterFilter({ wallet: 'current' }, 'wallet', 'all')).toBe('current');
  });

  it('falls back to the Settings default for a page with no pick', () => {
    expect(pickedCharacterFilter({ assets: 'all' }, 'wallet', 'current')).toBe('current');
    expect(pickedCharacterFilter({}, 'jobs', 'all')).toBe('all');
  });
});

describe('withCharacterFilterPick', () => {
  it('sets one page and leaves the others', () => {
    expect(withCharacterFilterPick({ assets: 'all' }, 'wallet', 'current')).toEqual({
      assets: 'all',
      wallet: 'current',
    });
  });
});

describe('parseCharacterFilterPicks', () => {
  it('keeps known pages with valid values', () => {
    expect(parseCharacterFilterPicks({ assets: 'all', jobs: 'current' })).toEqual({
      assets: 'all',
      jobs: 'current',
    });
  });

  it('drops unknown pages and invalid values', () => {
    expect(
      parseCharacterFilterPicks({ assets: 'all', nope: 'all', wallet: 'x', jobs: [1] })
    ).toEqual({
      assets: 'all',
    });
  });

  it('rejects a non-object', () => {
    expect(parseCharacterFilterPicks('all')).toBeNull();
    expect(parseCharacterFilterPicks(null)).toBeNull();
    expect(parseCharacterFilterPicks([])).toBeNull();
  });
});
