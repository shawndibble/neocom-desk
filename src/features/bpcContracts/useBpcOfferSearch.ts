import { useEffect, useMemo, useState } from 'react';
import { askBpcQuery, bpcQueryWorkerAvailable, SUPERSEDED } from './bpcQueryService';
import {
  assembleBpcOffers,
  expandBpcRankParts,
  prepareBpcOffers,
  rankBpcOffers,
  type BpcOfferSearch,
  type BpcPrepareInput,
  type BpcQuery,
  type BpcSourceData,
} from './searchBpcOffers';

export const WORKER_MIN_ROWS = 5_000;

const NO_OFFERS: BpcOfferSearch = {
  suggestions: [],
  filteredRows: [],
  bpoSourcesByType: new Map(),
  bpoByType: new Map(),
  displayRows: [],
  summary: null,
};

export interface BpcOfferSearchAnswer extends BpcOfferSearch {
  awaiting: boolean;
  refreshing: boolean;
}

interface Settled {
  data: BpcSourceData;
  prepareInput: BpcPrepareInput;
  query: BpcQuery;
  search: BpcOfferSearch;
}

export function useBpcOfferSearch(
  data: BpcSourceData,
  prepareInput: BpcPrepareInput,
  query: BpcQuery
): BpcOfferSearchAnswer {
  const viaWorker =
    data.contractRows.length + data.originals.length >= WORKER_MIN_ROWS &&
    bpcQueryWorkerAvailable();
  const {
    contractRows,
    originals,
    contractLocations,
    blueprintNames,
    ownedBlueprints,
    communityRows,
  } = data;
  const prepared = useMemo(
    () =>
      viaWorker
        ? null
        : prepareBpcOffers(
            {
              contractRows,
              originals,
              contractLocations,
              blueprintNames,
              ownedBlueprints,
              communityRows,
            },
            prepareInput
          ),
    [
      viaWorker,
      contractRows,
      originals,
      contractLocations,
      blueprintNames,
      ownedBlueprints,
      communityRows,
      prepareInput,
    ]
  );
  const onPage = useMemo(
    () => (prepared ? rankBpcOffers(prepared, data, query) : null),
    [prepared, data, query]
  );
  const [settled, setSettled] = useState<Settled | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  if (failure !== null) throw failure;

  useEffect(() => {
    if (!viaWorker) return;
    let live = true;
    askBpcQuery(data, prepareInput, query).then(
      (parts) => {
        if (!live) return;
        const search = assembleBpcOffers(expandBpcRankParts(parts, data), data, query.sources);
        setSettled({ data, prepareInput, query, search });
      },
      (error: unknown) => {
        if (!live || (error instanceof Error && error.message === SUPERSEDED)) return;
        try {
          const search = rankBpcOffers(prepareBpcOffers(data, prepareInput), data, query);
          setSettled({ data, prepareInput, query, search });
        } catch (thrown) {
          setFailure(thrown);
        }
      }
    );
    return () => {
      live = false;
    };
  }, [viaWorker, data, prepareInput, query]);

  const pending =
    viaWorker &&
    (settled?.data !== data || settled.prepareInput !== prepareInput || settled.query !== query);
  const search = onPage ?? settled?.search ?? NO_OFFERS;
  const keepsLastAnswer =
    pending && settled !== null && settled.prepareInput === prepareInput && settled.query === query;
  if (pending && !keepsLastAnswer) {
    return { ...NO_OFFERS, suggestions: search.suggestions, awaiting: true, refreshing: false };
  }
  return { ...search, awaiting: false, refreshing: keepsLastAnswer };
}
