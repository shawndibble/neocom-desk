import { describe, it, expect } from 'vitest';
import { characterPortraitUrl, typeIconUrl } from './eveImages';

describe('characterPortraitUrl', () => {
  it('builds the EVE image server portrait URL', () => {
    expect(characterPortraitUrl(90_000_001, 128)).toBe(
      'https://images.evetech.net/characters/90000001/portrait?size=128'
    );
  });
});

describe('typeIconUrl', () => {
  it('builds the EVE image server icon URL', () => {
    expect(typeIconUrl(9899, 64)).toBe('https://images.evetech.net/types/9899/icon?size=64');
    expect(typeIconUrl(9899, 32)).toBe('https://images.evetech.net/types/9899/icon?size=32');
  });
});
