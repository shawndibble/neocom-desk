/**
 * The Command Palette's Market Items group (#2319): every market item by
 * name, off the market catalogue (`loadMarketTypes`, ~1.5 MB, deliberately
 * outside the install precache). Loading it must never hold up typing, so the
 * group answers from the in-memory index when it is warm and with a Promise
 * (the palette's loading row) while it is cold.
 *
 * Matching is a linear scan over a name index built once — lowercased and
 * pre-sorted, so each keystroke is ~1 ms over the ~19.5k entries with no sort
 * of its own. Well under the ticket's 8 ms budget, so no worker and no
 * debounce.
 */
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { MARKET_TREE_MIN_QUERY_LENGTH } from '@/features/market/marketTree';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

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
  /** The index, loading the catalogue on first call; a failed load is forgotten so the next call retries. */
  load(): Promise<MarketItemIndex>;
  /** The index if it has already loaded — lets a warm search answer synchronously. */
  peek(): MarketItemIndex | null;
}

export function createMarketItemCatalogue(
  loadCatalogue: () => Promise<readonly MarketTypeEntry[]>
): MarketItemCatalogue {
  let pending: Promise<MarketItemIndex> | null = null;
  let ready: MarketItemIndex | null = null;
  return {
    load() {
      pending ??= loadCatalogue().then(
        (catalogue) => (ready = buildMarketItemIndex(catalogue)),
        (error: unknown) => {
          pending = null;
          throw error;
        }
      );
      return pending;
    },
    peek: () => ready,
  };
}

/** The session's one catalogue: loaded on first palette open, kept until reload. */
export const marketItemCatalogue = createMarketItemCatalogue(loadMarketTypes);

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
    order: 3,
    minQueryLength: MARKET_TREE_MIN_QUERY_LENGTH,
    search: (query) => {
      const index = catalogue.peek();
      return index ? answer(index, query) : catalogue.load().then((index) => answer(index, query));
    },
  };
}
