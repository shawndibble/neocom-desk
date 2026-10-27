import { describe, it, expect } from 'vitest';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { isItemsSearchActive, type ItemsSearchControls } from './itemsSearchActive';

const BLANK: ItemsSearchControls = {
  typeQuery: '',
  regionId: null,
  maxPrice: '',
  minQuantity: '',
  saleKind: null,
  hideAuctions: false,
  hidePlex: false,
  jumps: DEFAULT_JUMP_RANGE,
};

describe('isItemsSearchActive', () => {
  it('is false with every control at its default', () => {
    expect(isItemsSearchActive(BLANK, null)).toBe(false);
  });

  it('is false for a whitespace-only query', () => {
    expect(isItemsSearchActive({ ...BLANK, typeQuery: '   ' }, null)).toBe(false);
  });

  it.each<[string, Partial<ItemsSearchControls>]>([
    ['a typed query', { typeQuery: 'trit' }],
    ['a region', { regionId: 10000002 }],
    ['a max price', { maxPrice: '5000000' }],
    ['a minimum quantity', { minQuantity: '10' }],
    ['a sale kind', { saleKind: 'auction' }],
    ['hide auctions', { hideAuctions: true }],
    ['hide PLEX', { hidePlex: true }],
    ['a jump range', { jumps: '10' }],
  ])('is true with %s', (_label, patch) => {
    expect(isItemsSearchActive({ ...BLANK, ...patch }, null)).toBe(true);
  });

  it('is true with a pinned type even when the query box is blank', () => {
    expect(isItemsSearchActive(BLANK, 34)).toBe(true);
  });
});
