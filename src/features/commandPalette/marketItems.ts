import { queryTokens, searchKey, tokenPrefixMatch, wordsOf } from '@/lib/tokenSearch';
import { isOnline } from '@/stores/network';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

export const MARKET_ITEMS_MIN_QUERY_LENGTH = 3;

interface IndexedItem {
  readonly typeId: number;
  readonly name: string;
  readonly lower: string;
  readonly words: readonly string[];
}

export type MarketItemIndex = readonly IndexedItem[];

export function buildMarketItemIndex(catalogue: readonly MarketTypeEntry[]): MarketItemIndex {
  return catalogue
    .map(({ typeId, name }) => {
      const lower = searchKey(name);
      return { typeId, name, lower, words: wordsOf(lower) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchMarketItems(
  index: MarketItemIndex,
  query: string,
  limit: number
): IndexedItem[] {
  const q = searchKey(query.trim());
  if (!q) return [];
  const exact: IndexedItem[] = [];
  const prefix: IndexedItem[] = [];
  const substring: IndexedItem[] = [];
  const tokenPrefix: IndexedItem[] = [];
  const tokens = queryTokens(q);
  for (const item of index) {
    const { lower } = item;
    if (lower === q) exact.push(item);
    else if (lower.startsWith(q)) {
      if (exact.length + prefix.length < limit) prefix.push(item);
    } else if (exact.length + prefix.length + substring.length < limit && lower.includes(q)) {
      substring.push(item);
    } else if (
      tokens &&
      exact.length + prefix.length + substring.length + tokenPrefix.length < limit &&
      !lower.includes(q) &&
      tokenPrefixMatch(item.words, tokens)
    ) {
      tokenPrefix.push(item);
    }
  }
  return [...exact, ...prefix, ...substring, ...tokenPrefix].slice(0, limit);
}

export interface MarketItemCatalogue {
  load(options?: { retry?: boolean }): Promise<MarketItemIndex>;
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

export const marketItemCatalogue = createMarketItemCatalogue(() => loadMarketTypes());

export interface ShownMarketItem {
  readonly typeId: number;
  readonly name: string;
}

export interface MarketItemsProviderOptions {
  readonly catalogue: MarketItemCatalogue;
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
    order: 8,
    get errorKey() {
      return isOnline() ? undefined : 'commandPalette.itemSearchNeedsDownload';
    },
    minQueryLength: MARKET_ITEMS_MIN_QUERY_LENGTH,
    search: (query) => {
      const index = catalogue.peek();
      return index ? answer(index, query) : catalogue.load().then((index) => answer(index, query));
    },
  };
}
