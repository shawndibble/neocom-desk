import { describe, expect, it } from 'vitest';
import { placeHead, shortPlaceName } from './placeName';

describe('shortPlaceName', () => {
  it.each([
    ['Jita IV - Moon 4 - Caldari Navy Assembly Plant', 'Jita'],
    ['Amarr VIII (Oris) - Emperor Family Academy', 'Amarr'],
    ['Perimeter - Tranquility Trading Tower', 'Perimeter'],
    ['K-6K16 - Keepstar', 'K-6K16'],
    ['Jita', 'Jita'],
    ['Old Man Star IX - Moon 1 - Depot', 'Old Man Star'],
    ['  ', ''],
  ])('%s -> %s', (full, short) => {
    expect(shortPlaceName(full)).toBe(short);
  });
});

describe('placeHead', () => {
  it('keeps the planet and drops the moon and owner', () => {
    expect(placeHead('Jita IV - Moon 4 - Caldari Navy Assembly Plant')).toBe('Jita IV');
    expect(placeHead('Amarr VIII (Oris) - Emperor Family Academy')).toBe('Amarr VIII (Oris)');
    expect(placeHead('Jita')).toBe('Jita');
  });
});
