/**
 * The order the pilot dragged the Overview's cards into from the edit menu.
 *
 * Synced, one list for the whole account, for the same reason as the hidden
 * list beside it (`hiddenCards.ts`). Empty means "never reordered": the board
 * keeps its built-in order, and on a phone its urgency ranking. Once the pilot
 * reorders, their order holds everywhere, phone included — the two first
 * cards are the full ones whatever is on fire. "Reset order" empties it.
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

/**
 * The stored list after dragging `active` onto `over`. Keys this build does
 * not know stay on the end: the list merges last-write-wins as a whole, and
 * dropping them would reset a newer build's card on every device.
 */
export function moveCard(stored: readonly string[], active: string, over: string): string[] {
  const order = effectiveCardOrder(stored);
  const from = order.indexOf(active as OverviewCardKey);
  const to = order.indexOf(over as OverviewCardKey);
  const moved = from < 0 || to < 0 ? order : arrayMove(order, from, to);
  return [...moved, ...stored.filter((key) => !SORTABLE.has(key) && key !== 'alerts')];
}

export const useOverviewCardOrder = createSyncedSetting<string[]>({
  key: OVERVIEW_CARD_ORDER_KEY,
  defaultValue: [],
  // Same shape and the same forward-compatibility rule as the hidden list.
  parse: parseHiddenCards,
});
