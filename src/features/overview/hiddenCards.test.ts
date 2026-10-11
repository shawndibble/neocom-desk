import { describe, expect, it } from 'vitest';
import {
  isCardShown,
  OVERVIEW_CARD_KEYS,
  OVERVIEW_DEFAULT_OFF_CARDS,
  parseHiddenCards,
  showAllCards,
  toggleHiddenCard,
} from './hiddenCards';

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

/*
 * An off-by-default card (Incursions) inverts the rule: it shows only once the
 * pilot has switched it on, which the list records as a `show:` marker. A
 * plain key could not say "on" for it without also meaning "hidden" for the
 * build that wrote it.
 */
describe('off-by-default cards', () => {
  it('starts off', () => {
    expect(OVERVIEW_DEFAULT_OFF_CARDS).toContain('incursions');
    expect(isCardShown([], 'incursions')).toBe(false);
  });

  it('switches on, and back off, through the same toggle', () => {
    const on = toggleHiddenCard(['mining'], 'incursions');
    expect(on).toEqual(['mining', 'show:incursions']);
    expect(isCardShown(on, 'incursions')).toBe(true);
    expect(isCardShown(on, 'mining')).toBe(false);

    const off = toggleHiddenCard(on, 'incursions');
    expect(off).toEqual(['mining']);
    expect(isCardShown(off, 'incursions')).toBe(false);
  });

  it('stays off when its plain key is on the list, as "hide every card" writes it', () => {
    expect(isCardShown(['incursions'], 'incursions')).toBe(false);
  });

  it('is switched on by "Show all cards", like every other card', () => {
    const all = showAllCards();
    for (const key of OVERVIEW_CARD_KEYS) expect(isCardShown(all, key)).toBe(true);
  });
});
