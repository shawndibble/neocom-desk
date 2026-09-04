import { describe, it, expect } from 'vitest';
import {
  allianceLogoUrl,
  characterPortraitUrl,
  corporationLogoUrl,
  typeIconUrl,
} from './eveImages';

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

describe('corporationLogoUrl', () => {
  it('builds the EVE image server corporation logo URL', () => {
    expect(corporationLogoUrl(98_000_001, 128)).toBe(
      'https://images.evetech.net/corporations/98000001/logo?size=128'
    );
  });
});

describe('allianceLogoUrl', () => {
  it('builds the EVE image server alliance logo URL', () => {
    expect(allianceLogoUrl(99_000_001, 64)).toBe(
      'https://images.evetech.net/alliances/99000001/logo?size=64'
    );
  });
});
