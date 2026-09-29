import { describe, expect, it } from 'vitest';
import { effectiveCardOrder, moveCard, SORTABLE_CARD_KEYS } from './cardOrder';

describe('effectiveCardOrder', () => {
  it('is the default order when nothing is stored', () => {
    expect(effectiveCardOrder([])).toEqual(SORTABLE_CARD_KEYS);
  });

  it('puts the stored cards first, then any the pilot never placed in default order', () => {
    const order = effectiveCardOrder(['mail', 'orders']);
    expect(order.slice(0, 2)).toEqual(['mail', 'orders']);
    expect(order.slice(2)).toEqual(
      SORTABLE_CARD_KEYS.filter((k) => k !== 'mail' && k !== 'orders')
    );
  });

  it('skips keys this build has no card for, and never includes the alerts column', () => {
    const order = effectiveCardOrder(['someFutureCard', 'alerts', 'mining']);
    expect(order[0]).toBe('mining');
    expect(order).not.toContain('alerts');
    expect(order).toHaveLength(SORTABLE_CARD_KEYS.length);
  });
});

describe('moveCard', () => {
  it('moves a card to where another one was', () => {
    const next = moveCard([], 'mail', 'orders');
    expect(next.slice(0, 2)).toEqual(['mail', 'orders']);
  });

  /*
   * The stored list merges last-write-wins as a whole, so a build that dropped
   * a newer build's key on its next move would reset that card's place on
   * every device. Unknown keys ride along at the end.
   */
  it('keeps keys this build does not know', () => {
    const next = moveCard(['someFutureCard', 'mining', 'orders'], 'orders', 'mining');
    expect(next.slice(0, 2)).toEqual(['orders', 'mining']);
    expect(next).toContain('someFutureCard');
  });

  it('leaves the order alone for a drop on itself', () => {
    expect(moveCard(['mining'], 'mining', 'mining')).toEqual(effectiveCardOrder(['mining']));
  });
});
