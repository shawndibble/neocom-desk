import { describe, expect, it } from 'vitest';
import { isCardShown, parseHiddenCards, toggleHiddenCard } from './hiddenCards';

describe('parseHiddenCards', () => {
  it('keeps a list of card keys', () => {
    expect(parseHiddenCards(['mining', 'alerts'])).toEqual(['mining', 'alerts']);
  });

  /*
   * The value is last-write-wins as a whole. A build that dropped a key it
   * did not recognise would write the shortened list back on its next toggle
   * and un-hide a newer build's card on every device.
   */
  it('keeps keys this build has no card for', () => {
    expect(parseHiddenCards(['mining', 'someFutureCard'])).toEqual(['mining', 'someFutureCard']);
  });

  it('drops duplicates and anything that is not a string', () => {
    expect(parseHiddenCards(['mining', 'mining', 3, null, 'orders'])).toEqual(['mining', 'orders']);
  });

  it('rejects a value that is not a list', () => {
    expect(parseHiddenCards('mining')).toBeNull();
    expect(parseHiddenCards({ mining: true })).toBeNull();
    expect(parseHiddenCards(null)).toBeNull();
  });
});

describe('toggleHiddenCard', () => {
  it('hides a shown card', () => {
    expect(toggleHiddenCard(['orders'], 'mining')).toEqual(['orders', 'mining']);
  });

  it('shows a hidden card, leaving the rest hidden', () => {
    expect(toggleHiddenCard(['orders', 'mining', 'someFutureCard'], 'mining')).toEqual([
      'orders',
      'someFutureCard',
    ]);
  });

  it('leaves its input untouched', () => {
    const hidden = ['orders'];
    toggleHiddenCard(hidden, 'orders');
    expect(hidden).toEqual(['orders']);
  });
});

describe('isCardShown', () => {
  it('is true unless the card is on the hidden list', () => {
    expect(isCardShown(['mining'], 'orders')).toBe(true);
    expect(isCardShown(['mining'], 'mining')).toBe(false);
  });
});
