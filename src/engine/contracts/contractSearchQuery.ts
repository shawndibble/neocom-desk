/**
 * One whole Item search question over the snapshot, as a pure function: which
 * rows pass, in the table's default order, and what each type's tally looks
 * like. The panel runs it on the page where there is no Worker (jsdom) and in
 * `contractQuery.worker.ts` everywhere else, so both answer identically.
 *
 * It answers in *indices into the rows it was given*, never row objects: the
 * worker's reply stays a flat typed array, and the page maps it back onto the
 * rows it already holds instead of cloning 370k objects per keystroke.
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  addToOfferStats,
  offerPassesFilter,
  sortableOfferPrice,
  type ContractOfferFilter,
  type ContractOfferStats,
} from '@/engine/contracts/contractSearch';
import { withinJumpRange } from '@/engine/route/jumpRange';

export interface ContractOfferQuery {
  /** Everything but the item type; carries `plexPrice`. */
  filter: ContractOfferFilter;
  /** `null` = no type restriction; an empty set matches nothing. */
  typeIds: ReadonlySet<number> | null;
  /** Systems inside the Jump Range, or `null` when no range is active. */
  allowedSystems: ReadonlySet<number> | null;
  /**
   * Resolved offer locations → system (`null` for one placed in no system).
   * A location absent here is still resolving: its row stays, since only a
   * finished answer excludes.
   */
  locationSystems: ReadonlyMap<number, number | null>;
  /** Cheapest first, an unpriced row last; off, snapshot order. */
  sort: boolean;
}

export interface ContractOfferQueryResult {
  /** Rows after every filter, in order. */
  indices: Uint32Array;
  /** Per type, over the rows that pass everything except the type set. */
  stats: Map<number, ContractOfferStats>;
}

export function queryContractOffers(
  rows: readonly PublicContractOfferRow[],
  { filter, typeIds, allowedSystems, locationSystems, sort }: ContractOfferQuery
): ContractOfferQueryResult {
  const plexPrice = filter.plexPrice ?? null;
  const stats = new Map<number, ContractOfferStats>();
  const passing: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!offerPassesFilter(row, filter)) continue;
    if (allowedSystems !== null) {
      const system = locationSystems.get(row.locationId);
      if (system !== undefined && !withinJumpRange(system, allowedSystems)) continue;
    }
    addToOfferStats(stats, row, plexPrice);
    if (typeIds === null || typeIds.has(row.typeId)) passing.push(i);
  }
  const indices = Uint32Array.from(passing);
  if (sort) {
    const keys = new Float64Array(rows.length);
    for (const i of passing) keys[i] = sortableOfferPrice(rows[i], plexPrice);
    // Stable, so equal prices keep the snapshot's order.
    indices.sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0));
  }
  return { indices, stats };
}
