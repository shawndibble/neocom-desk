/**
 * The Command Palette's Market Items group (#2319): every market item by
 * name, off the market catalogue (`loadMarketTypes`, ~1.5 MB, deliberately
 * outside the install precache). Loading it must never hold up typing, so the
 * group answers from the in-memory index when it is warm and with a Promise
 * (the palette's loading row) while it is cold.
 *
 * Matching is a linear scan over a name index built once — lowercased and
 * pre-sorted, so a keystroke does no sort and no lowercasing of its own. Its
 * own scan rather than `rankedSearch` (same ranking) for that reason:
 * measured in node over the real ~19.5k entries, 0.1–0.8 ms a keystroke
 * against `rankedSearch`'s ~1.5 ms. Either is well under the ticket's 8 ms
 * budget, so no worker and no debounce.
 */
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

/** Same threshold as the Market Browser's tree search: shorter matches half the catalogue. */
export const MARKET_ITEMS_MIN_QUERY_LENGTH = 3;

interface IndexedItem {
  readonly typeId: number;
  readonly name: string;
  readonly lower: string;
}

/** Sorted by name, so each rank's matches come out alphabetical without a per-query sort. */
export type MarketItemIndex = readonly IndexedItem[];

export function buildMarketItemIndex(catalogue: readonly MarketTypeEntry[]): MarketItemIndex {
  return catalogue
    .map(({ typeId, name }) => ({ typeId, name, lower: name.toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Exact, then prefix, then substring match on the name; alphabetical within each. */
export function searchMarketItems(
  index: MarketItemIndex,
  query: string,
  limit: number
): IndexedItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact: IndexedItem[] = [];
  const prefix: IndexedItem[] = [];
  const substring: IndexedItem[] = [];
  for (const item of index) {
    const { lower } = item;
    if (lower === q) exact.push(item);
    else if (lower.startsWith(q)) {
      // Nothing below prefix can make the cut once prefix alone fills it.
      if (exact.length + prefix.length < limit) prefix.push(item);
    } else if (exact.length + prefix.length + substring.length < limit && lower.includes(q)) {
      substring.push(item);
    }
  }
  return [...exact, ...prefix, ...substring].slice(0, limit);
}

export interface MarketItemCatalogue {
  /**
   * The index, loading the catalogue on first call. A failed load stays
   * failed until a call asks to `retry` (the palette's next opening), so an
   * offline pilot's keystrokes do not each refetch the whole catalogue.
   */
  load(options?: { retry?: boolean }): Promise<MarketItemIndex>;
  /** The index if it has already loaded — lets a warm search answer synchronously. */
  peek(): MarketItemIndex | null;
}

export function createMarketItemCatalogue(
  loadCatalogue: () => Promise<readonly MarketTypeEntry[]>
): MarketItemCatalogue {
  let pending: Promise<MarketItemIndex> | null = null;
  let ready: MarketItemIndex | null = null;
  let failed = false;
  return {
    load({ retry = false } = {}) {
      if (retry && failed) {
        pending = null;
        failed = false;
      }
      pending ??= loadCatalogue().then(
        (catalogue) => (ready = buildMarketItemIndex(catalogue)),
        (error: unknown) => {
          failed = true;
          throw error;
        }
      );
      return pending;
    },
    peek: () => ready,
  };
}

/**
 * The session's one catalogue: loaded on first palette open, kept until
 * reload. The loader is read at call time, not at import: the shell imports
 * this module on every page, and a test that mocks `loadMarketSde` without
 * `loadMarketTypes` would otherwise fail on import alone.
 */
export const marketItemCatalogue = createMarketItemCatalogue(() => loadMarketTypes());

export interface ShownMarketItem {
  readonly typeId: number;
  readonly name: string;
}

export interface MarketItemsProviderOptions {
  readonly catalogue: MarketItemCatalogue;
  /** Opens the item's Item Detail over the current page. */
  readonly onSelect: (item: ShownMarketItem) => void;
}

export function createMarketItemsProvider({
  catalogue,
  onSelect,
}: MarketItemsProviderOptions): PaletteProvider {
  const answer = (index: MarketItemIndex, query: string): PaletteResult[] =>
    searchMarketItems(index, query, GROUP_LIMIT).map(({ typeId, name }) => ({
      id: String(typeId),
      label: name,
      run: () => onSelect({ typeId, name }),
    }));
  return {
    id: 'marketItems',
    labelKey: 'commandPalette.groups.marketItems',
    order: 7,
    minQueryLength: MARKET_ITEMS_MIN_QUERY_LENGTH,
    search: (query) => {
      const index = catalogue.peek();
      return index ? answer(index, query) : catalogue.load().then((index) => answer(index, query));
    },
  };
}
