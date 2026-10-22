/**
 * **Stock Lists** — a market's named set of **Stock Targets** (GLOSSARY.md) —
 * and the pure edits the Stock tab and the "Set stock target…" dialog make to them.
 *
 * The stored value is whatever the last device to sync wrote, possibly an
 * older build, so `parseStockLists` keeps every usable list and drops only
 * what is damaged rather than losing every list at once.
 */

export interface StockTarget {
  typeId: number;
  /** Whole units wanted listed at the market. Always 1 or more. */
  target: number;
}

export interface StockList {
  id: string;
  name: string;
  /** The station or structure the pilot sells at: the market this list stocks. */
  locationId: number;
  items: StockTarget[];
}

/** A typed quantity past this is a typo, not a Stock Target. */
export const MAX_STOCK_TARGET = 1_000_000_000;

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function usableTargets(raw: unknown): StockTarget[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const items: StockTarget[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const typeId = positiveInteger((entry as Record<string, unknown>).typeId);
    const target = positiveInteger((entry as Record<string, unknown>).target);
    if (typeId === null || target === null || seen.has(typeId)) continue;
    seen.add(typeId);
    items.push({ typeId, target: Math.min(target, MAX_STOCK_TARGET) });
  }
  return items;
}

function usableList(raw: unknown): StockList | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, name, locationId, items } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return null;
  if (typeof name !== 'string' || name.trim() === '') return null;
  const market = positiveInteger(locationId);
  if (market === null) return null;
  return {
    id,
    name: name.trim(),
    locationId: market,
    items: usableTargets(items),
  };
}

/** Null when the value is not a list at all: the store's cue to use its default. */
export function parseStockLists(raw: unknown): StockList[] | null {
  if (!Array.isArray(raw)) return null;
  const lists: StockList[] = [];
  for (const entry of raw) {
    const list = usableList(entry);
    if (list !== null && !lists.some((l) => l.id === list.id)) lists.push(list);
  }
  return lists;
}

function updateList(
  lists: readonly StockList[],
  listId: string,
  update: (list: StockList) => StockList
): StockList[] {
  return lists.map((list) => (list.id === listId ? update(list) : list));
}

/**
 * A blank name is ignored: `parseStockLists` would drop the list on the next
 * read. Starting Stock Targets (from the pilot's current listings) are cleaned
 * the same way a stored list is.
 */
export function addStockList(
  lists: readonly StockList[],
  list: { id: string; name: string; locationId: number; items?: readonly StockTarget[] }
): StockList[] {
  const name = list.name.trim();
  if (name === '' || stockListAt(lists, list.locationId)) return [...lists];
  return [
    ...lists,
    { id: list.id, name, locationId: list.locationId, items: usableTargets(list.items ?? []) },
  ];
}

export function renameStockList(
  lists: readonly StockList[],
  listId: string,
  name: string
): StockList[] {
  const trimmed = name.trim();
  if (trimmed === '') return [...lists];
  return updateList(lists, listId, (list) => ({ ...list, name: trimmed }));
}

export function removeStockList(lists: readonly StockList[], listId: string): StockList[] {
  return lists.filter((list) => list.id !== listId);
}

export function setStockListLocation(
  lists: readonly StockList[],
  listId: string,
  locationId: number
): StockList[] {
  const there = stockListAt(lists, locationId);
  if (there && there.id !== listId) return [...lists];
  return updateList(lists, listId, (list) => ({ ...list, locationId }));
}

/**
 * The market kept at a station or structure. One list per place: an alert names
 * its market by place, so two lists there would leave it unable to say which.
 */
export function stockListAt(
  lists: readonly StockList[],
  locationId: number
): StockList | undefined {
  return lists.find((list) => list.locationId === locationId);
}

/** Adds the Stock Targets a list does not have yet; an item already on it keeps its own. */
export function addMissingStockTargets(
  lists: readonly StockList[],
  listId: string,
  targets: readonly StockTarget[]
): StockList[] {
  const list = lists.find((l) => l.id === listId);
  if (!list) return [...lists];
  const have = new Set(list.items.map((item) => item.typeId));
  return targets
    .filter((item) => !have.has(item.typeId))
    .reduce((acc, item) => setStockTarget(acc, listId, item.typeId, item.target), [...lists]);
}

/**
 * Adds or replaces one Stock Target. The quantity is rounded to whole units
 * and capped; zero or less removes it, so clearing the field is how a pilot
 * takes an item off the list.
 */
export function setStockTarget(
  lists: readonly StockList[],
  listId: string,
  typeId: number,
  target: number
): StockList[] {
  const quantity = Number.isFinite(target) ? Math.min(Math.round(target), MAX_STOCK_TARGET) : 0;
  if (quantity <= 0) return removeStockTarget(lists, listId, typeId);
  return updateList(lists, listId, (list) => {
    const exists = list.items.some((item) => item.typeId === typeId);
    const items = exists
      ? list.items.map((item) => (item.typeId === typeId ? { typeId, target: quantity } : item))
      : [...list.items, { typeId, target: quantity }];
    return { ...list, items };
  });
}

export function removeStockTarget(
  lists: readonly StockList[],
  listId: string,
  typeId: number
): StockList[] {
  return updateList(lists, listId, (list) => ({
    ...list,
    items: list.items.filter((item) => item.typeId !== typeId),
  }));
}

/** Removes several Stock Targets in one edit (the Manager's bulk remove). */
export function removeStockTargets(
  lists: readonly StockList[],
  listId: string,
  typeIds: readonly number[]
): StockList[] {
  const drop = new Set(typeIds);
  return updateList(lists, listId, (list) => ({
    ...list,
    items: list.items.filter((item) => !drop.has(item.typeId)),
  }));
}
