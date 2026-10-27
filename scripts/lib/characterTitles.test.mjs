import { describe, it, expect } from 'vitest';
import { bakeCharacterTitles } from './characterTitles.mjs';

describe('bakeCharacterTitles', () => {
  it('maps each title UUID to its English name, sorted by UUID', () => {
    expect(
      bakeCharacterTitles([
        { _key: 'b-2', name: { en: 'Selenologist', de: 'x' } },
        { _key: 'a-1', name: { en: 'Pathfinder' } },
      ])
    ).toEqual({ 'a-1': 'Pathfinder', 'b-2': 'Selenologist' });
    expect(
      Object.keys(
        bakeCharacterTitles([
          { _key: 'b', name: { en: 'B' } },
          { _key: 'a', name: { en: 'A' } },
        ])
      )
    ).toEqual(['a', 'b']);
  });

  it('skips rows with no key or no English name', () => {
    expect(
      bakeCharacterTitles([
        { _key: 'a', name: { de: 'nur deutsch' } },
        { _key: 'b', name: { en: '  ' } },
        { _key: 'c' },
        { name: { en: 'No key' } },
        { _key: 'd', name: { en: 'Kept' } },
      ])
    ).toEqual({ d: 'Kept' });
  });
});
