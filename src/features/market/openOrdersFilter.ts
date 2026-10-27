/**
 * Filtering, sorting and the removable "active filters" chip row for the
 * Market Orders page. Reads `OpenOrderRow` fields only — every judgement
 * (which problem an order has, whether it beats me) was already made by
 * `openOrdersModel.ts`; this module never re-derives one.
 *
 * `problems`/`characterIds` are arrays because more than one can be active
 * at once (OR'd within a field, the way filter chips usually read). Each
 * SELECTED VALUE gets its own chip rather than one chip for the whole field:
 * a player who picked three characters expects to remove one of them and
 * keep the other two, and per-value chips give each one a stable, unique
 * `id` (`character:123`) for free. `clear` on a per-value chip removes only
 * that value from the array, never the whole constraint.
 */
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
  /** Empty means every character. */
  characterIds: readonly number[];
  /** Empty means every location. Matches against a row's `locationId`. */
  locationIds: readonly number[];
  /** Empty means every problem. Matches against a row's `problems`, so filters overlap honestly. */
  problems: readonly OrderProblem[];
  /** Null means any. */
  expiringWithinDays: number | null;
  /** 'linked' | 'missing' | null. */
  costBasis: 'linked' | 'missing' | null;
  /** Null means any. */
  minIskTiedUp: number | null;
  /** The Needs you / Watch / All segment. Not a removable constraint: there is always one. */
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

/**
 * Every problem a filter may name — that is, every `OrderProblem` except
 * `healthy`.
 *
 * Healthy orders are the Fine bucket, reached through the All segment
 * (`view`), not the funnel. A funnel chip for `healthy` would empty the
 * default Needs you segment under a chip that reads as though it should have
 * matched something, which is why it is excluded here rather than left to
 * each caller to remember.
 */
export const FILTERABLE_PROBLEMS: readonly OrderProblem[] = ORDER_PROBLEMS.filter(
  (problem) => problem !== 'healthy'
);

/** One filter option per distinct `locationId` across `rows`, alphabetised by name. */
export interface LocationFilterOption {
  locationId: number;
  /** The full station/structure name, or a fallback naming an unresolved structure by id. */
  label: string;
}

/**
 * The location filter's option catalog: every location any of `rows` sits
 * in, deduplicated and named for the search box. Uses the full station name
 * rather than the table's truncated `stationShortName` — the same trade hub's
 * several stations ("Jita 4 - Moon 4 - ...", "Jita 4 - Moon 11 - ...") would
 * otherwise collide, and it is what the search box should match against.
 * A row whose `stationName` is null (an unresolved player structure, per
 * `openOrdersModel.ts`) still gets its own option, named by its id so several
 * unresolved structures do not all collapse into one indistinguishable entry.
 */
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
  // Null expiry (unparseable payload) sorts last — "unknown" is not "soonest".
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

/** Stable; never mutates `rows`. */
export function sortOpenOrders(
  rows: readonly OpenOrderRow[],
  sort: OpenOrdersSort
): OpenOrderRow[] {
  return [...rows].sort(COMPARATORS[sort]);
}

/**
 * How many constraints the funnel holds, for `FilterBar`'s `activeCount`: one
 * per selected value of an array field, one per set scalar. `sort` and `view`
 * are not constraints (there is always exactly one of each); `filterOpenOrders`
 * never reads `view` either: the segment splits what the funnel matched.
 */
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

// --- URL state --------------------------------------------------------------

/** Where the Orders page lives. Written down once here so every link agrees. */
const ORDERS_PATH = '/market/orders';

/** A closed set of members, comma-joined — same shape as `idListParam`, but of enum values rather than ids. */
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

/**
 * The whole filter, one `{ key, codec }` per field, scoped `orders.*` so it
 * can never collide with another panel's params on the same page (ADR 0015).
 */
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
  /** OR'd, the way the filter's own `problems` are. */
  problems?: readonly OrderProblem[];
  characterIds?: readonly number[];
  /** Opens with the work-through queue already started. */
  workThrough?: boolean;
}

/** The one-shot param that opens Open Orders with the work-through queue started; spent on arrival. */
export const WORK_THROUGH_PARAM = 'orders.workThrough';

/**
 * A link to the Orders page already narrowed to what the linker counted.
 *
 * The Overview board's tiles are the caller: a tile reading "21 undercut" that
 * opens a page listing thirty is a tile that lied, because the board counts
 * one Character's orders and the page fans out across all of them. Carrying
 * the character makes the two figures agree, and the funnel's active count
 * ("Filters (1 active)") says the list arrived narrowed.
 *
 * Built from the same `OPEN_ORDERS_FILTER_PARAMS` codecs the page itself
 * reads live, so a link the board builds and a page that has since changed
 * its own params can never silently disagree about the shape of the URL.
 */
export function openOrdersHref({
  problems,
  characterIds,
  workThrough,
}: OpenOrdersLinkTarget): string {
  const params = new URLSearchParams();
  const problemsRaw = OPEN_ORDERS_FILTER_PARAMS['orders.problems'].serialize(problems ?? []);
  if (problemsRaw !== null) params.set('orders.problems', problemsRaw);
  // Opens on the segment holding what the link names (Needs you is the default).
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
