import { jumpRangeLimit, type JumpRange } from '@/engine/route/jumpRange';
import { lpRate } from '@/engine/loyalty/marketLpValue';
import { rankedSearch, type RankedSearchOptions } from '@/lib/rankedSearch';
import type { NearestStation } from './lpStoreSnapshot';
import type { LoyaltyOfferRow } from './offerRows';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';

export const MIN_SELLS_PER_DAY_OPTIONS = [0, 1, 5, 20] as const;
export type MinSellsPerDay = (typeof MIN_SELLS_PER_DAY_OPTIONS)[number];

export interface LpLandingFilters {
  faction: number | 'all' | 'none';
  range: JumpRange;
  minSellsPerDay: MinSellsPerDay;
  mineOnly: boolean;
  hideFactionWarfare: boolean;
  noTurnIns: boolean;
  affordableOnly: boolean;
  categories: readonly number[];
}

export const DEFAULT_LP_LANDING_FILTERS: LpLandingFilters = {
  faction: 'all',
  range: 'any',
  minSellsPerDay: 1,
  mineOnly: false,
  hideFactionWarfare: false,
  noTurnIns: false,
  affordableOnly: false,
  categories: [],
};

export interface LpLandingStoreFacts {
  corporationId: number;
  name: string;
  factionId: number | null;
  factionWarfare: boolean;
  nearest: NearestStation | null;
  yourLp: number | null;
  lpValue: number | null;
  offerCount: number;
}

export interface LpLandingOffer {
  row: LoyaltyOfferRow;
  store: LpLandingStoreFacts;
  categoryId: number | null;
}

export interface LpLandingStore extends LpLandingStoreFacts {
  best: LpLandingOffer | null;
}

function storePasses(store: LpLandingStoreFacts, filters: LpLandingFilters): boolean {
  if (filters.mineOnly && store.yourLp === null) return false;
  if (filters.hideFactionWarfare && store.factionWarfare) return false;
  if (filters.faction === 'none' && store.factionId !== null) return false;
  if (typeof filters.faction === 'number' && store.factionId !== filters.faction) return false;
  const limit = jumpRangeLimit(filters.range);
  return limit === null || (store.nearest !== null && store.nearest.jumps <= limit);
}

function offerPasses(offer: LpLandingOffer, filters: LpLandingFilters): boolean {
  const { row } = offer;
  if (row.sellsPerDay !== null && row.sellsPerDay < filters.minSellsPerDay) return false;
  if (filters.noTurnIns && row.offer.required_items.length > 0) return false;
  if (filters.affordableOnly && (offer.store.yourLp ?? 0) < row.offer.lp_cost) return false;
  if (filters.categories.length > 0) {
    if (offer.categoryId === null || !filters.categories.includes(offer.categoryId)) return false;
  }
  return true;
}

function matching<T>(items: T[], query: string, options: RankedSearchOptions<T>): T[] {
  if (query.trim() === '') return items;
  const hits = new Set(rankedSearch(items, query, options));
  return items.filter((item) => hits.has(item));
}

export function lpLandingOffers(
  offers: readonly LpLandingOffer[],
  filters: LpLandingFilters,
  query: string
): LpLandingOffer[] {
  const passing = offers.filter((o) => storePasses(o.store, filters) && offerPasses(o, filters));
  return matching(passing, query, {
    primary: (o) => o.row.itemName,
    secondary: [(o) => o.store.name],
    limit: passing.length,
  });
}

export function lpLandingBestOffers(
  offers: readonly LpLandingOffer[],
  filters: LpLandingFilters
): ReadonlyMap<number, LpLandingOffer> {
  const best = new Map<number, LpLandingOffer>();
  for (const offer of offers) {
    const value = offer.row.profit.iskPerLp;
    if (value === null || !offerPasses(offer, filters)) continue;
    const current = best.get(offer.store.corporationId);
    if (!current || value > current.row.profit.iskPerLp!)
      best.set(offer.store.corporationId, offer);
  }
  return best;
}

export function lpLandingStores(
  stores: readonly LpLandingStoreFacts[],
  best: ReadonlyMap<number, LpLandingOffer>,
  filters: LpLandingFilters,
  query: string
): LpLandingStore[] {
  const passing = stores.filter((store) => storePasses(store, filters));
  return matching(passing, query, { primary: (s) => s.name, limit: passing.length }).map(
    (store) => ({ ...store, best: best.get(store.corporationId) ?? null })
  );
}

interface LpLandingNamed {
  id: number;
  name: string;
}

export function activeLpLandingFilters<F extends LpLandingFilters>(
  filters: F,
  t: Translate,
  {
    factions,
    categories,
  }: { factions: readonly LpLandingNamed[]; categories: readonly LpLandingNamed[] }
): ActiveFilter<F>[] {
  const active: ActiveFilter<F>[] = [];
  const { faction } = filters;
  if (faction !== 'all')
    active.push({
      label: t('loyaltyStore.landing.factionLabel'),
      value:
        faction === 'none'
          ? t('loyaltyStore.landing.noFaction')
          : factions.find((option) => option.id === faction)?.name,
      clear: (value) => ({ ...value, faction: 'all' }),
    });
  if (filters.range !== 'any')
    active.push({
      label: t('jumpRange.label'),
      value: t(`jumpRange.option.${filters.range}`),
      clear: (value) => ({ ...value, range: 'any' }),
    });
  if (filters.minSellsPerDay !== 0)
    active.push({
      label: t('loyaltyStore.landing.minSellsLabel'),
      value: t('loyaltyStore.landing.minSellsPerDay', { count: filters.minSellsPerDay }),
      clear: (value) => ({ ...value, minSellsPerDay: 0 }),
    });
  if (filters.categories.length > 0) {
    const names = filters.categories.flatMap(
      (id) => categories.find((option) => option.id === id)?.name ?? []
    );
    active.push({
      label: t('loyaltyStore.landing.categoryLabel'),
      value: names.length > 0 ? summarizeFilterValues(names, t) : undefined,
      clear: (value) => ({ ...value, categories: [] }),
    });
  }
  const showOnlyPicks = [
    ['mineOnly', 'loyaltyStore.landing.mineOnly'],
    ['affordableOnly', 'loyaltyStore.landing.affordable'],
    ['noTurnIns', 'loyaltyStore.landing.noTurnIns'],
    ['hideFactionWarfare', 'loyaltyStore.landing.hideFactionWarfare'],
  ] as const;
  const picked = showOnlyPicks.filter(([key]) => filters[key]);
  if (picked.length > 0)
    active.push({
      label: t('loyaltyStore.landing.showOnlyLabel'),
      value: summarizeFilterValues(
        picked.map(([, labelKey]) => t(labelKey)),
        t
      ),
      clear: (value) => ({
        ...value,
        mineOnly: false,
        affordableOnly: false,
        noTurnIns: false,
        hideFactionWarfare: false,
      }),
    });
  return active;
}

export interface LpLandingHoldings {
  stores: number;
  lp: number;
  worth: number;
  unpriced: number;
  best: LpLandingStoreFacts | null;
}

const LP_VALUE_SORT = { columnId: 'lpValue', direction: 'desc' } as const;
const YOUR_LP_SORT = { columnId: 'yourLp', direction: 'desc' } as const;

export function lpLandingStoreSort(
  holdings: LpLandingHoldings | null
): typeof LP_VALUE_SORT | typeof YOUR_LP_SORT {
  return holdings !== null && holdings.lp > 0 ? YOUR_LP_SORT : LP_VALUE_SORT;
}

export function lpLandingHoldings(
  stores: readonly LpLandingStoreFacts[],
  ownLpValue: number
): LpLandingHoldings | null {
  const held = stores.flatMap((store) =>
    store.yourLp === null ? [] : [{ store, lp: store.yourLp }]
  );
  if (held.length === 0) return null;
  let lp = 0;
  let worth = 0;
  let unpriced = 0;
  let best: LpLandingStoreFacts | null = null;
  for (const { store, lp: balance } of held) {
    lp += balance;
    const { rate } = lpRate(ownLpValue, store.lpValue);
    if (rate === null) unpriced++;
    else worth += balance * rate;
    if (store.lpValue !== null && (best === null || store.lpValue > best.lpValue!)) best = store;
  }
  return { stores: held.length, lp, worth, unpriced, best };
}
