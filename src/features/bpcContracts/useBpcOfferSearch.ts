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

/** Below this the page answers itself: a handful of early rows is faster than a round trip. */
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
  /**
   * The worker has not answered this exact question yet and there is nothing
   * fit to show: the first load, or a filter edit. The fields are empty;
   * callers show a spinner, so a new filter never sits under the last one's
   * table and summary.
   */
  awaiting: boolean;
  /**
   * Only the snapshot changed (a background reload) and the worker is still
   * ranking it. The fields are the previous answer, kept on screen.
   */
  refreshing: boolean;
}

interface Settled {
  data: BpcSourceData;
  prepareInput: BpcPrepareInput;
  query: BpcQuery;
  search: BpcOfferSearch;
}

/**
 * `prepareBpcOffers` + `rankBpcOffers` over the snapshot — in the worker for a
 * big one, on the page for a small one or where there is no Worker. On the page
 * the two stages are memoised separately, so a keystroke reruns only stage 2.
 * `prepareInput` must keep its identity while its content does; the worker
 * keeps stage 1's result for as long as it does.
 */
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
  // Thrown in render, as the page path would: the error boundary catches it.
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
        // The worker failed: answer on the page, once.
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
  // A background reload keeps the last answer up; a filter edit or the first load blanks.
  const keepsLastAnswer =
    pending && settled !== null && settled.prepareInput === prepareInput && settled.query === query;
  if (pending && !keepsLastAnswer) {
    // Suggestions stay up between keystrokes; everything about the rows waits for the answer.
    return { ...NO_OFFERS, suggestions: search.suggestions, awaiting: true, refreshing: false };
  }
  return { ...search, awaiting: false, refreshing: keepsLastAnswer };
}
