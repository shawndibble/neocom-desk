/**
 * The order the pilot dragged the Overview's cards into from the edit menu.
 *
 * Synced, one list for the whole account, for the same reason as the hidden
 * list beside it (`hiddenCards.ts`). The order always decides the board,
 * phone included: the first two cards in it are a phone's full ones whatever
 * is on fire — the pilot chose that over urgency ranking, and a list in the
 * menu that the phone did not follow would be a second, hidden order. Empty
 * means the built-in order, and "Reset order" empties it.
 *
 * Alerts is not part of it: on desktop it is a column beside the grid, not a
 * slot in it, so there is no position for it to take.
 */
import { arrayMove } from '@dnd-kit/sortable';
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { OVERVIEW_CARD_KEYS, parseHiddenCards, type OverviewCardKey } from './hiddenCards';

export const OVERVIEW_CARD_ORDER_KEY = 'sync.overviewCardOrder';

/** Every card that takes a place in the grid, in the board's built-in order. */
export const SORTABLE_CARD_KEYS: readonly OverviewCardKey[] = OVERVIEW_CARD_KEYS.filter(
  (key) => key !== 'alerts'
);

const SORTABLE = new Set<string>(SORTABLE_CARD_KEYS);

/**
 * The stored cards in the pilot's order, then any card they never placed —
 * one added in a later build — in built-in order at the end.
 */
export function effectiveCardOrder(stored: readonly string[]): OverviewCardKey[] {
  const placed = stored.filter((key): key is OverviewCardKey => SORTABLE.has(key));
  const placedSet = new Set<string>(placed);
  return [...placed, ...SORTABLE_CARD_KEYS.filter((key) => !placedSet.has(key))];
}

/** Whether the stored list puts every card where the built-in order already does. */
export function isDefaultOrder(stored: readonly string[]): boolean {
  const order = effectiveCardOrder(stored);
  return order.every((key, index) => key === SORTABLE_CARD_KEYS[index]);
}

/**
 * The stored list after dragging `active` onto `over`. Keys this build does
 * not know stay exactly where they were: the list merges last-write-wins as a
 * whole, and moving or dropping them would shift a newer build's card on
 * every device the next time an older build reorders anything.
 */
export function moveCard(stored: readonly string[], active: string, over: string): string[] {
  const kept = stored.filter((key) => key !== 'alerts');
  const keptSet = new Set(kept);
  const full = [...kept, ...SORTABLE_CARD_KEYS.filter((key) => !keptSet.has(key))];
  const from = full.indexOf(active);
  const to = full.indexOf(over);
  return from < 0 || to < 0 ? full : arrayMove(full, from, to);
}

export const useOverviewCardOrder = createSyncedSetting<string[]>({
  key: OVERVIEW_CARD_ORDER_KEY,
  defaultValue: [],
  // Same shape and the same forward-compatibility rule as the hidden list.
  parse: parseHiddenCards,
});
