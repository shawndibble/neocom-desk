import { useEffect, useMemo, useState } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractOfferStats } from '@/engine/contracts/contractSearch';
import {
  queryContractOffers,
  type ContractOfferQuery,
  type ContractOfferQueryResult,
} from '@/engine/contracts/contractSearchQuery';
import { askContractQuery, contractQueryWorkerAvailable, SUPERSEDED } from './contractQueryService';

export const WORKER_MIN_ROWS = 5_000;

const NO_ROWS: PublicContractOfferRow[] = [];
const NO_STATS: ReadonlyMap<number, ContractOfferStats> = new Map();

export interface ContractOfferQueryAnswer {
  displayRows: PublicContractOfferRow[];
  stats: ReadonlyMap<number, ContractOfferStats>;
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
