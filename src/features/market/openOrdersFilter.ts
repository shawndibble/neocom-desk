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

export type OpenOrdersSort = 'worstFirst' | 'expirySoonest' | 'iskTiedUp' | 'item' | 'character';

export interface OpenOrdersFilter {
  text: string;
  side: 'buy' | 'sell' | null;
  /** Empty means every character. */
  characterIds: readonly number[];
  /** Empty means every problem. Matches against a row's `problems`, so filters overlap honestly. */
  problems: readonly OrderProblem[];
  /** Null means any. */
  expiringWithinDays: number | null;
  /** 'linked' | 'missing' | null. */
  costBasis: 'linked' | 'missing' | null;
  /** Null means any. */
  minIskTiedUp: number | null;
  hideHealthy: boolean;
  sort: OpenOrdersSort;
}

export const EMPTY_OPEN_ORDERS_FILTER: OpenOrdersFilter = {
  text: '',
  side: null,
  characterIds: [],
  problems: [],
  expiringWithinDays: null,
  costBasis: null,
  minIskTiedUp: null,
  hideHealthy: false,
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

function matchesHideHealthy(row: OpenOrderRow, hideHealthy: boolean): boolean {
  if (!hideHealthy) return true;
  return row.problem !== 'healthy';
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
      matchesProblems(row, filter.problems) &&
      matchesExpiringWithinDays(row, filter.expiringWithinDays) &&
      matchesCostBasis(row, filter.costBasis) &&
      matchesMinIskTiedUp(row, filter.minIskTiedUp) &&
      matchesHideHealthy(row, filter.hideHealthy)
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

/** One chip per active constraint, for the removable "active filters" row. `clear` returns the filter without that constraint. */
export interface ActiveFilterChip {
  id: string;
  labelKey: string;
  value?: string;
  clear: (filter: OpenOrdersFilter) => OpenOrdersFilter;
}

function withoutArrayValue<T>(values: readonly T[], value: T): T[] {
  return values.filter((v) => v !== value);
}

/**
 * `sort` is not a removable constraint (there is always exactly one active
 * sort) and is deliberately excluded here.
 */
export function activeFilterChips(filter: OpenOrdersFilter): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filter.text.trim() !== '') {
    chips.push({
      id: 'text',
      labelKey: 'market.orders.filter.text',
      value: filter.text,
      clear: (f) => ({ ...f, text: '' }),
    });
  }

  if (filter.side !== null) {
    chips.push({
      id: 'side',
      labelKey: 'market.orders.filter.side',
      value: filter.side,
      clear: (f) => ({ ...f, side: null }),
    });
  }

  for (const characterId of filter.characterIds) {
    chips.push({
      id: `character:${characterId}`,
      labelKey: 'market.orders.filter.character',
      value: String(characterId),
      clear: (f) => ({ ...f, characterIds: withoutArrayValue(f.characterIds, characterId) }),
    });
  }

  for (const problem of filter.problems) {
    chips.push({
      id: `problem:${problem}`,
      labelKey: 'market.orders.filter.problem',
      value: problem,
      clear: (f) => ({ ...f, problems: withoutArrayValue(f.problems, problem) }),
    });
  }

  if (filter.expiringWithinDays !== null) {
    chips.push({
      id: 'expiringWithinDays',
      labelKey: 'market.orders.filter.expiringWithin',
      value: String(filter.expiringWithinDays),
      clear: (f) => ({ ...f, expiringWithinDays: null }),
    });
  }

  if (filter.costBasis !== null) {
    chips.push({
      id: 'costBasis',
      labelKey: 'market.orders.filter.costBasis',
      value: filter.costBasis,
      clear: (f) => ({ ...f, costBasis: null }),
    });
  }

  if (filter.minIskTiedUp !== null) {
    chips.push({
      id: 'minIskTiedUp',
      labelKey: 'market.orders.filter.minIskTiedUp',
      value: String(filter.minIskTiedUp),
      clear: (f) => ({ ...f, minIskTiedUp: null }),
    });
  }

  if (filter.hideHealthy) {
    chips.push({
      id: 'hideHealthy',
      labelKey: 'market.orders.filter.hideHealthy',
      clear: (f) => ({ ...f, hideHealthy: false }),
    });
  }

  return chips;
}

export function activeFilterCount(filter: OpenOrdersFilter): number {
  return activeFilterChips(filter).length;
}

// --- Deep links -----------------------------------------------------------

/**
 * Where the Orders page lives. Written down once here rather than at each
 * caller, so a link built by the board and a link parsed by the page cannot
 * disagree about the route they are both describing.
 */
const ORDERS_PATH = '/market?section=orders';

export interface OpenOrdersLinkTarget {
  /** OR'd, the way the filter's own `problems` are. */
  problems?: readonly OrderProblem[];
  characterIds?: readonly number[];
}

/**
 * A link to the Orders page already narrowed to what the linker counted.
 *
 * The Overview board's tiles are the caller: a tile reading "21 undercut" that
 * opens a page listing thirty is a tile that lied, because the board counts
 * one Character's orders and the page fans out across all of them. Carrying
 * the character makes the two figures agree, and `activeFilterChips` renders
 * every value it applied as its own removable chip — so widening back out is
 * one click, and visibly so.
 *
 * Repeated params rather than one comma-separated value: `URLSearchParams`
 * reads and writes that shape natively, which leaves no delimiter to escape.
 */
export function openOrdersHref({ problems, characterIds }: OpenOrdersLinkTarget): string {
  const params = new URLSearchParams();
  for (const problem of problems ?? []) params.append('problem', problem);
  for (const characterId of characterIds ?? []) params.append('character', String(characterId));
  const query = params.toString();
  return query === '' ? ORDERS_PATH : `${ORDERS_PATH}&${query}`;
}

/**
 * The other direction: what a URL asks the Orders page to show.
 *
 * Layered onto the page's own default rather than onto `EMPTY_*` — arriving by
 * deep link narrows the page, it does not reset everything else about it.
 *
 * Nothing here throws or reports a failure. A URL is typed, shared, bookmarked
 * and edited by hand, so an unreadable value is an ordinary event rather than
 * an error, and the page it asked for is still the right thing to show. The
 * base is returned by identity when the URL says nothing, so a caller can tell
 * "no deep link" from "a deep link that narrowed nothing".
 */
export function openOrdersFilterFromParams(
  params: URLSearchParams,
  base: OpenOrdersFilter
): OpenOrdersFilter {
  const problems = params
    .getAll('problem')
    .filter((value): value is OrderProblem =>
      (ORDER_PROBLEMS as readonly string[]).includes(value)
    );
  const characterIds = params
    .getAll('character')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));
  if (problems.length === 0 && characterIds.length === 0) return base;
  return {
    ...base,
    ...(problems.length > 0 && { problems }),
    ...(characterIds.length > 0 && { characterIds }),
  };
}
