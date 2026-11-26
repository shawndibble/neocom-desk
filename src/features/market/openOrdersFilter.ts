import type { TFunction } from 'i18next';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import { formatIskCompact } from '@/lib/isk';
import type { OpenOrderRow } from './openOrdersModel';
import { compareOpenOrderRowsWorstFirst } from './openOrdersModel';
import { ORDER_PROBLEMS, type OrderProblem } from '@/engine/market/orderProblems';
import { OPEN_ORDERS_VIEWS, viewForProblems, type OpenOrdersView } from './orderUrgency';
import {
  defineUrlFilter,
  enumParam,
  idListParam,
  optionalEnumParam,
  optionalIdParam,
  textParam,
  type UrlParamCodec,
} from '@/lib/urlState';

export type OpenOrdersSort = 'worstFirst' | 'expirySoonest' | 'iskTiedUp' | 'item' | 'character';

export const OPEN_ORDERS_SORTS: readonly OpenOrdersSort[] = [
  'worstFirst',
  'expirySoonest',
  'iskTiedUp',
  'item',
  'character',
];

export interface OpenOrdersFilter {
  text: string;
  side: 'buy' | 'sell' | null;
  characterIds: readonly number[];
  locationIds: readonly number[];
  problems: readonly OrderProblem[];
  expiringWithinDays: number | null;
  costBasis: 'linked' | 'missing' | null;
  minIskTiedUp: number | null;
  view: OpenOrdersView;
  sort: OpenOrdersSort;
}

export const EMPTY_OPEN_ORDERS_FILTER: OpenOrdersFilter = {
  text: '',
  side: null,
  characterIds: [],
  locationIds: [],
  problems: [],
  expiringWithinDays: null,
  costBasis: null,
  minIskTiedUp: null,
  view: 'act',
  sort: 'worstFirst',
};

function matchesText(row: OpenOrderRow, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    row.typeName.toLowerCase().includes(needle) || row.characterName.toLowerCase().includes(needle)
  );
}

function matchesSide(row: OpenOrderRow, side: OpenOrdersFilter['side']): boolean {
  if (side === null) return true;
  return side === 'buy' ? row.isBuyOrder : !row.isBuyOrder;
}

function matchesCharacterIds(row: OpenOrderRow, characterIds: readonly number[]): boolean {
  if (characterIds.length === 0) return true;
  return characterIds.includes(row.characterId);
}

function matchesLocationIds(row: OpenOrderRow, locationIds: readonly number[]): boolean {
  if (locationIds.length === 0) return true;
  return locationIds.includes(row.locationId);
}

function matchesProblems(row: OpenOrderRow, problems: readonly OrderProblem[]): boolean {
  if (problems.length === 0) return true;
  return problems.some((problem) => row.problems.includes(problem));
}

function matchesExpiringWithinDays(row: OpenOrderRow, days: number | null): boolean {
  if (days === null) return true;
  if (row.expiry === null) return false;
  return row.expiry.daysLeft <= days;
}

function matchesCostBasis(row: OpenOrderRow, costBasis: OpenOrdersFilter['costBasis']): boolean {
  if (costBasis === null) return true;
  return costBasis === 'linked' ? row.costBasis !== null : row.costBasis === null;
}

function matchesMinIskTiedUp(row: OpenOrderRow, min: number | null): boolean {
  if (min === null) return true;
  return row.iskTiedUp >= min;
}

export const FILTERABLE_PROBLEMS: readonly OrderProblem[] = ORDER_PROBLEMS.filter(
  (problem) => problem !== 'healthy'
);

export interface LocationFilterOption {
  locationId: number;
  label: string;
}

export function locationFilterOptions(
  rows: readonly OpenOrderRow[],
  unknownLabel: (locationId: number) => string
): LocationFilterOption[] {
  const byId = new Map<number, string>();
  for (const row of rows) {
    if (byId.has(row.locationId)) continue;
    byId.set(row.locationId, row.stationName ?? unknownLabel(row.locationId));
  }
  return [...byId.entries()]
    .map(([locationId, label]) => ({ locationId, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function filterOpenOrders(
  rows: readonly OpenOrderRow[],
  filter: OpenOrdersFilter
): OpenOrderRow[] {
  return rows.filter(
    (row) =>
      matchesText(row, filter.text) &&
      matchesSide(row, filter.side) &&
      matchesCharacterIds(row, filter.characterIds) &&
      matchesLocationIds(row, filter.locationIds) &&
      matchesProblems(row, filter.problems) &&
      matchesExpiringWithinDays(row, filter.expiringWithinDays) &&
      matchesCostBasis(row, filter.costBasis) &&
      matchesMinIskTiedUp(row, filter.minIskTiedUp)
  );
}

function compareExpirySoonest(a: OpenOrderRow, b: OpenOrderRow): number {
  if (a.expiry === null && b.expiry === null) return a.orderId - b.orderId;
  if (a.expiry === null) return 1;
  if (b.expiry === null) return -1;
  if (a.expiry.daysLeft !== b.expiry.daysLeft) return a.expiry.daysLeft - b.expiry.daysLeft;
  return a.orderId - b.orderId;
}

function compareIskTiedUp(a: OpenOrderRow, b: OpenOrderRow): number {
  if (b.iskTiedUp !== a.iskTiedUp) return b.iskTiedUp - a.iskTiedUp;
  return a.orderId - b.orderId;
}

function compareItem(a: OpenOrderRow, b: OpenOrderRow): number {
  const cmp = a.typeName.localeCompare(b.typeName);
  return cmp !== 0 ? cmp : a.orderId - b.orderId;
}

function compareCharacter(a: OpenOrderRow, b: OpenOrderRow): number {
  const cmp = a.characterName.localeCompare(b.characterName);
  return cmp !== 0 ? cmp : a.orderId - b.orderId;
}

const COMPARATORS: Record<OpenOrdersSort, (a: OpenOrderRow, b: OpenOrderRow) => number> = {
  worstFirst: compareOpenOrderRowsWorstFirst,
  expirySoonest: compareExpirySoonest,
  iskTiedUp: compareIskTiedUp,
  item: compareItem,
  character: compareCharacter,
};

export function sortOpenOrders(
  rows: readonly OpenOrderRow[],
  sort: OpenOrdersSort
): OpenOrderRow[] {
  return [...rows].sort(COMPARATORS[sort]);
}

export function activeFilterCount(filter: OpenOrdersFilter): number {
  const scalars = [
    filter.text.trim() !== '',
    filter.side !== null,
    filter.expiringWithinDays !== null,
    filter.costBasis !== null,
    filter.minIskTiedUp !== null,
  ].filter(Boolean).length;
  return scalars + filter.characterIds.length + filter.locationIds.length + filter.problems.length;
}

export interface OpenOrdersFilterNames {
  location: (locationId: number) => string;
  character?: (characterId: number) => string;
}

export function activeOpenOrdersFilters(
  filter: OpenOrdersFilter,
  t: TFunction,
  names: OpenOrdersFilterNames
): ActiveFilter<OpenOrdersFilter>[] {
  const active: ActiveFilter<OpenOrdersFilter>[] = [];
  const characterName = names.character;
  if (characterName && filter.characterIds.length > 0)
    active.push({
      label: t('market.orders.filter.characters'),
      value: summarizeFilterValues(filter.characterIds.map(characterName), t),
      clear: (v) => ({ ...v, characterIds: [] }),
    });
  if (filter.problems.length > 0)
    active.push({
      label: t('market.orders.filter.problems'),
      value: summarizeFilterValues(
        filter.problems.map((problem) => t(`market.orders.group.${problem}`)),
        t
      ),
      clear: (v) => ({ ...v, problems: [] }),
    });
  if (filter.side !== null)
    active.push({
      label: t('orders.side'),
      value: t(filter.side === 'buy' ? 'orders.buy' : 'orders.sell'),
      clear: (v) => ({ ...v, side: null }),
    });
  if (filter.locationIds.length > 0)
    active.push({
      label: t('market.orders.filter.location'),
      value: summarizeFilterValues(filter.locationIds.map(names.location), t),
      clear: (v) => ({ ...v, locationIds: [] }),
    });
  if (filter.costBasis !== null)
    active.push({
      label: t('market.orders.filter.costBasis'),
      value: t(
        filter.costBasis === 'linked'
          ? 'market.orders.filter.costBasisLinked'
          : 'market.orders.filter.costBasisMissing'
      ),
      clear: (v) => ({ ...v, costBasis: null }),
    });
  if (filter.expiringWithinDays !== null)
    active.push({
      label: t('market.orders.filter.expiringWithin'),
      value: t('market.orders.filter.expiringWithinOption', { count: filter.expiringWithinDays }),
      clear: (v) => ({ ...v, expiringWithinDays: null }),
    });
  if (filter.minIskTiedUp !== null)
    active.push({
      label: t('market.orders.filter.minIskTiedUp'),
      value: t('market.orders.filter.minIskTiedUpOption', {
        amount: formatIskCompact(filter.minIskTiedUp),
      }),
      clear: (v) => ({ ...v, minIskTiedUp: null }),
    });
  return active;
}

const ORDERS_PATH = '/market/orders';

function enumListParam<V extends string>(values: readonly V[]): UrlParamCodec<readonly V[]> {
  return {
    parse: (raw) => {
      if (raw === null || raw === '') return [];
      const matched = raw
        .split(',')
        .filter((value): value is V => (values as readonly string[]).includes(value));
      return matched.length === 0 ? [] : [...new Set(matched)];
    },
    serialize: (value) => (value.length === 0 ? null : [...new Set(value)].join(',')),
  };
}

export const {
  schema: OPEN_ORDERS_FILTER_PARAMS,
  fieldToParam: OPEN_ORDERS_FIELD_TO_PARAM,
  emptyParams: DEFAULT_OPEN_ORDERS_FILTER_PARAMS,
} = defineUrlFilter<OpenOrdersFilter>({
  text: { key: 'orders.q', codec: textParam() },
  side: { key: 'orders.side', codec: optionalEnumParam<'buy' | 'sell'>(['buy', 'sell']) },
  characterIds: { key: 'orders.characters', codec: idListParam() },
  locationIds: { key: 'orders.locations', codec: idListParam() },
  problems: { key: 'orders.problems', codec: enumListParam(FILTERABLE_PROBLEMS) },
  expiringWithinDays: { key: 'orders.expiring', codec: optionalIdParam() },
  costBasis: {
    key: 'orders.costBasis',
    codec: optionalEnumParam<'linked' | 'missing'>(['linked', 'missing']),
  },
  minIskTiedUp: { key: 'orders.minIsk', codec: optionalIdParam() },
  view: { key: 'orders.view', codec: enumParam(OPEN_ORDERS_VIEWS, 'act') },
  sort: { key: 'orders.sort', codec: enumParam(OPEN_ORDERS_SORTS, 'worstFirst') },
});

export interface OpenOrdersLinkTarget {
  problems?: readonly OrderProblem[];
  characterIds?: readonly number[];
  workThrough?: boolean;
}

export const WORK_THROUGH_PARAM = 'orders.workThrough';

export function openOrdersHref({
  problems,
  characterIds,
  workThrough,
}: OpenOrdersLinkTarget): string {
  const params = new URLSearchParams();
  const problemsRaw = OPEN_ORDERS_FILTER_PARAMS['orders.problems'].serialize(problems ?? []);
  if (problemsRaw !== null) params.set('orders.problems', problemsRaw);
  const viewRaw = OPEN_ORDERS_FILTER_PARAMS['orders.view'].serialize(
    viewForProblems(problems ?? [])
  );
  if (viewRaw !== null) params.set('orders.view', viewRaw);
  const charactersRaw = OPEN_ORDERS_FILTER_PARAMS['orders.characters'].serialize(
    characterIds ?? []
  );
  if (charactersRaw !== null) params.set('orders.characters', charactersRaw);
  if (workThrough) params.set(WORK_THROUGH_PARAM, '1');
  const query = params.toString();
  return query === '' ? ORDERS_PATH : `${ORDERS_PATH}?${query}`;
}
