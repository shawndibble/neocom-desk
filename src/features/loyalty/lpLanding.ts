/**
 * The LP Store landing's two views over every LP Store (scope decisions
 * `20261030-200155-lp-store-landing-*`): Stores, one row per corporation
 * ranked by its market LP Value, and Offers, every offer of every store.
 * One filter set serves both. Store-level filters (faction, distance, held
 * LP, Faction Warfare, the search box in Stores) decide which stores are
 * listed; offer-level filters (daily sales, turn-ins, affordability,
 * category) decide which offers are listed and which one a store's Best
 * offer may name. LP Value is never filtered.
 *
 * Pure over rows the hook (`useLpStoreLanding`) already priced.
 */
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
  /** A faction id, `none` for factionless corporations, or `all`. */
  faction: number | 'all' | 'none';
  range: JumpRange;
  /** Units a day; 0 is any volume. */
  minSellsPerDay: MinSellsPerDay;
  mineOnly: boolean;
  hideFactionWarfare: boolean;
  noTurnIns: boolean;
  affordableOnly: boolean;
  /** Root Market Group ids; empty is every category. */
  categories: readonly number[];
}

/** Opens on a 1-a-day sales floor (scope decision 20261030-200155-…-hides-offers-that-sell-under); nothing else narrows. */
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

/** What both views know about one LP Store, before any filter. */
export interface LpLandingStoreFacts {
  corporationId: number;
  name: string;
  /** Null for a factionless corporation (Sisters of EVE, Mordu's Legion). */
  factionId: number | null;
  /** A faction's militia corporation (ESI `militia_corporation_id`). */
  factionWarfare: boolean;
  /** Null until distances resolve, or when no station is reachable. */
  nearest: NearestStation | null;
  /** The active Character's balance; null when it holds none here. */
  yourLp: number | null;
  /** The store's market LP Value (ISK per LP); null when its offers give too little to go on. */
  lpValue: number | null;
  offerCount: number;
}

export interface LpLandingOffer {
  row: LoyaltyOfferRow;
  store: LpLandingStoreFacts;
  /** The offered item's root Market Group; null when it has none. */
  categoryId: number | null;
}

export interface LpLandingStore extends LpLandingStoreFacts {
  /** The best ISK/LP among the store's offers that pass the offer filters. */
  best: LpLandingOffer | null;
}

function storePasses(store: LpLandingStoreFacts, filters: LpLandingFilters): boolean {
  if (filters.mineOnly && store.yourLp === null) return false;
  if (filters.hideFactionWarfare && store.factionWarfare) return false;
  if (filters.faction === 'none' && store.factionId !== null) return false;
  if (typeof filters.faction === 'number' && store.factionId !== filters.faction) return false;
  const limit = jumpRangeLimit(filters.range);
  // An unplaced store fails any real range: "within 5 jumps" is a claim.
  return limit === null || (store.nearest !== null && store.nearest.jumps <= limit);
}

function offerPasses(offer: LpLandingOffer, filters: LpLandingFilters): boolean {
  const { row } = offer;
  // Unknown volume is not zero volume.
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

/** The Offers view: every offer passing both filter levels and the query (item or store name). */
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

/** Each store's best ISK/LP among its offers that pass the offer filters; independent of the query. */
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

/** The Stores view: stores passing the store filters and the query, each with its best passing offer. */
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

/** A faction or category the filters name by id, with the name the controls show. */
interface LpLandingNamed {
  id: number;
  name: string;
}

/**
 * The funnel's pills: each filter that narrows the list, the default sales
 * floor included — like the store modal's "I can afford", it is on when the
 * page opens and the row says so, and its remove drops it to any volume. The
 * hub and price basis are settings the numbers are priced at, not filters, so
 * they never show. The Show only picks are one control, so they are one pill
 * naming the ticked picks, and its remove unticks them all. Generic so the bar's wider value (those settings) rides
 * through each `clear`.
 */
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
      // Unnamed until the categories load: the caption alone still says it is on.
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
  /** Stores the Character holds LP with. */
  stores: number;
  lp: number;
  /** Each balance at its rate (`lpRate`): the pilot's own LP Value when set, else the store's. */
  worth: number;
  /** Held stores no rate prices; their LP is left out of `worth`, never counted free. */
  unpriced: number;
  /** The held store whose LP is worth most, by its market LP Value; null when none has one. */
  best: LpLandingStoreFacts | null;
}

/** The Character's LP across every store, valued; null when it holds none. */
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
