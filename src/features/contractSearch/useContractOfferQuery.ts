import { useEffect, useMemo, useState } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractOfferStats } from '@/engine/contracts/contractSearch';
import {
  queryContractOffers,
  type ContractOfferQuery,
  type ContractOfferQueryResult,
} from '@/engine/contracts/contractSearchQuery';
import { askContractQuery, contractQueryWorkerAvailable, SUPERSEDED } from './contractQueryService';

/** Below this the page answers itself: a handful of early rows is faster than a round trip. */
export const WORKER_MIN_ROWS = 5_000;

const NO_ROWS: PublicContractOfferRow[] = [];
const NO_STATS: ReadonlyMap<number, ContractOfferStats> = new Map();

export interface ContractOfferQueryAnswer {
  /** The rows that pass, in order. */
  displayRows: PublicContractOfferRow[];
  /** Per type, over the rows passing everything but the type set. */
  stats: ReadonlyMap<number, ContractOfferStats>;
  /**
   * The worker has not answered this exact question yet. `displayRows` may be
   * the previous answer (or empty); callers show a spinner, not those rows,
   * so a new selection never sits under the last one's table and summary.
   */
  awaitingFirst: boolean;
}

interface Settled {
  rows: readonly PublicContractOfferRow[];
  query: ContractOfferQuery;
  result: ContractOfferQueryResult;
}

function pickRows(
  rows: readonly PublicContractOfferRow[],
  indices: Uint32Array
): PublicContractOfferRow[] {
  const out = new Array<PublicContractOfferRow>(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = rows[indices[i]];
  return out;
}

/**
 * `queryContractOffers` over the snapshot — in the worker for a big one, on
 * the page for a small one or where there is no Worker. While the worker is
 * on a newer query the previous stats stay up, so the suggestion list never
 * flashes empty between keystrokes.
 */
export function useContractOfferQuery(
  rows: readonly PublicContractOfferRow[],
  query: ContractOfferQuery
): ContractOfferQueryAnswer {
  const viaWorker = rows.length >= WORKER_MIN_ROWS && contractQueryWorkerAvailable();
  const onPage = useMemo(
    () => (viaWorker ? null : queryContractOffers(rows, query)),
    [viaWorker, rows, query]
  );
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!viaWorker) return;
    let live = true;
    askContractQuery(rows, query).then(
      (result) => {
        if (live) setSettled({ rows, query, result });
      },
      (error: unknown) => {
        if (!live || (error instanceof Error && error.message === SUPERSEDED)) return;
        // The worker failed: answer on the page, once.
        setSettled({ rows, query, result: queryContractOffers(rows, query) });
      }
    );
    return () => {
      live = false;
    };
  }, [viaWorker, rows, query]);

  const source: Settled | null = onPage ? { rows, query, result: onPage } : settled;
  const sourceRows = source?.rows;
  const sourceResult = source?.result;
  const displayRows = useMemo(
    () => (sourceRows && sourceResult ? pickRows(sourceRows, sourceResult.indices) : NO_ROWS),
    [sourceRows, sourceResult]
  );
  return {
    displayRows,
    stats: sourceResult?.stats ?? NO_STATS,
    awaitingFirst: viaWorker && (settled?.rows !== rows || settled.query !== query),
  };
}
