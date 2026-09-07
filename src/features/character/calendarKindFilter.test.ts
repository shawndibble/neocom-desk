import { describe, expect, it } from 'vitest';
import { CHARACTER_BOARD_ITEM_KINDS } from '@/engine/character/board';
import { shownKinds, toggleHiddenKind } from './calendarKindFilter';

describe('shownKinds', () => {
  it('shows everything when nothing is hidden', () => {
    expect(shownKinds([])).toEqual(new Set(CHARACTER_BOARD_ITEM_KINDS));
  });

  it('shows the complement of what is hidden', () => {
    const shown = shownKinds(['industryJob', 'orderExpiry']);
    expect(shown.has('industryJob')).toBe(false);
    expect(shown.has('orderExpiry')).toBe(false);
    expect(shown.has('calendarEvent')).toBe(true);
    expect(shown.size).toBe(CHARACTER_BOARD_ITEM_KINDS.length - 2);
  });

  /**
   * The point of storing exclusions rather than selections: a kind added to
   * the board later is not in anyone's stored array, and must therefore arrive
   * switched *on*. Stored as selections it would have arrived hidden, invisible
   * to exactly the pilots who already use the page.
   */
  it('shows a kind nobody has an opinion about', () => {
    const hidden = ['industryJob'] as const;
    for (const kind of CHARACTER_BOARD_ITEM_KINDS) {
      if (kind !== 'industryJob') expect(shownKinds(hidden).has(kind)).toBe(true);
    }
  });

  /** Deselecting every kind is a thing a pilot can do, and the view owes them an explicit say-so. */
  it('can show nothing at all', () => {
    expect(shownKinds(CHARACTER_BOARD_ITEM_KINDS).size).toBe(0);
  });
});

describe('toggleHiddenKind', () => {
  it('hides a kind that was shown', () => {
    expect(toggleHiddenKind([], 'planetExtraction')).toEqual(['planetExtraction']);
  });

  it('shows a kind that was hidden, leaving the others alone', () => {
    expect(toggleHiddenKind(['planetExtraction', 'orderExpiry'], 'planetExtraction')).toEqual([
      'orderExpiry',
    ]);
  });
});
