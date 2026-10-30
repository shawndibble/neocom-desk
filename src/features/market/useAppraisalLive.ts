/**
 * The Appraisal page's live-price layer (issue #5591), kept apart from
 * `useAppraisal`'s Fuzzwork load so the first paint stays instant: the
 * cached outcome lands first, then each row swaps to its live hub book as it
 * arrives, most valuable rows first. Nothing else in the app reads this.
 *
 * The books live in the module cache (`liveBooks.ts`, 10 minutes), so a
 * re-price from a changed percent or hub finds them already there and makes
 * no request. Compare Hubs' other four hubs are fetched only once it is
 * opened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAppraisal,
  buildHubComparison,
  type AppraisalItem,
  type PriceState,
} from '@/engine/market/appraisal';
import { applyLiveBooks, liveStationBook, type LiveBookLookup } from '@/engine/market/liveBook';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import type { AppraisalOutcome, HubComparisonRow } from './appraisalData';
import { loadLiveBooks, peekLiveBook, type LiveBook, type LiveBookRequest } from './liveBooks';
import { loadAllCharactersOpenOrders } from './openOrdersData';
import { ownOrderIdSet } from './openOrdersModel';

type Books = ReadonlyMap<string, LiveBook | 'failed'>;
const NO_BOOKS: Books = new Map();
const NO_OWN: ReadonlySet<number> = new Set();

const bookKey = (hub: TradeHub, typeId: number) => `${hub.stationId}:${typeId}`;

/** How far a live run has got, for the progress text and bar. */
export interface LiveProgress {
  /** A run is fetching right now. */
  checking: boolean;
  /** Books settled (live or failed) / books wanted. */
  done: number;
  total: number;
  /** Settled books that failed: their rows stay on cached prices. */
  failed: number;
  /** When the oldest live book was fetched; null before any landed. */
  checkedAt: number | null;
}

export interface AppraisalLive {
  /** `base` with each row's live prices swapped in as they land. */
  result: AppraisalOutcome | null;
  /** The five hubs' totals, live per hub once its books landed. */
  compare: HubComparisonRow[] | null;
  live: LiveProgress;
  /** Progress of the other four hubs' books, fetched once Compare Hubs is open. */
  compareLive: LiveProgress;
  /** Resolves with the result once every row has settled, so a copy never reads a cached row. */
  settle: () => Promise<AppraisalOutcome | null>;
  /** The next run refetches whatever the age: the Refresh button. */
  forceNextRun: () => void;
}

/** Most valuable rows first: the order they go live. */
function valueOrdered(items: readonly AppraisalItem[]): number[] {
  return [...items]
    .sort(
      (a, b) =>
        (b.sell ?? b.buy ?? 0) * b.quantity - (a.sell ?? a.buy ?? 0) * a.quantity ||
        a.typeId - b.typeId
    )
    .map((item) => item.typeId);
}

function mergeOutcome(
  base: AppraisalOutcome,
  pricePercent: number,
  lookup: (typeId: number) => LiveBookLookup
): AppraisalOutcome {
  const items = applyLiveBooks(base.appraisal.items, lookup);
  const allLive = items.every((item) => item.priceState === 'live');
  return {
    ...base,
    appraisal: buildAppraisal(items, pricePercent),
    // Every row read a live book, so the Fuzzwork outage notes no longer apply.
    ...(allLive ? { pricesUnreachable: false, pricesStale: false } : {}),
  };
}

function lookupFrom(books: Books, hub: TradeHub, own: ReadonlySet<number>) {
  return (typeId: number): LiveBookLookup => {
    const book = books.get(bookKey(hub, typeId));
    if (book === undefined) return undefined;
    return book === 'failed' ? 'failed' : liveStationBook(book.orders, hub.stationId, own);
  };
}

function progressOf(
  books: Books,
  requests: readonly LiveBookRequest[],
  checking: boolean
): LiveProgress {
  let done = 0;
  let failed = 0;
  let checkedAt: number | null = null;
  for (const request of requests) {
    const book = books.get(bookKey(request.hub, request.typeId));
    if (book === undefined) continue;
    done += 1;
    if (book === 'failed') failed += 1;
    else checkedAt = checkedAt === null ? book.fetchedAt : Math.min(checkedAt, book.fetchedAt);
  }
  return { checking, done, total: requests.length, failed, checkedAt };
}

async function loadOwnOrderIds(): Promise<ReadonlySet<number>> {
  try {
    return ownOrderIdSet(await loadAllCharactersOpenOrders());
  } catch {
    // No orders scope, or the read failed: nothing counts as the pilot's own.
    return NO_OWN;
  }
}

export function useAppraisalLive({
  base,
  baseCompare,
  hub,
  pricePercent,
  compareOpen,
}: {
  base: AppraisalOutcome | null;
  baseCompare: HubComparisonRow[] | null;
  hub: TradeHub;
  pricePercent: number;
  compareOpen: boolean;
}): AppraisalLive {
  const [books, setBooks] = useState<Books>(NO_BOOKS);
  const [own, setOwn] = useState<ReadonlySet<number>>(NO_OWN);
  const [checking, setChecking] = useState(false);
  const [compareChecking, setCompareChecking] = useState(false);
  const forcePrimary = useRef(false);
  const forceCompare = useRef(false);
  const compareOpenRef = useRef(compareOpen);
  const percentRef = useRef(pricePercent);
  const run = useRef<Promise<AppraisalOutcome> | null>(null);
  const latest = useRef<AppraisalOutcome | null>(null);

  const typeIds = useMemo(() => (base === null ? [] : valueOrdered(base.appraisal.items)), [base]);
  const requests = useMemo<LiveBookRequest[]>(
    () => typeIds.map((typeId) => ({ hub, typeId })),
    [typeIds, hub]
  );
  const compareRequests = useMemo<LiveBookRequest[]>(
    () =>
      TRADE_HUBS.filter((h) => h.id !== hub.id).flatMap((other) =>
        typeIds.map((typeId) => ({ hub: other, typeId }))
      ),
    [typeIds, hub]
  );

  useEffect(() => {
    compareOpenRef.current = compareOpen;
    percentRef.current = pricePercent;
  }, [compareOpen, pricePercent]);

  // The selected hub's books.
  useEffect(() => {
    if (base === null || requests.length === 0) return;
    const force = forcePrimary.current;
    forcePrimary.current = false;
    let cancelled = false;

    const promise = (async () => {
      const settled = new Map<string, LiveBook | 'failed'>();
      for (const request of requests) {
        const cached = force ? undefined : peekLiveBook(request);
        if (cached) settled.set(bookKey(hub, request.typeId), cached);
      }
      const wanted = requests.filter((r) => !settled.has(bookKey(hub, r.typeId)));
      // Seeds from the cache (nothing wanted again is no flicker) and drops a failure left from the last run.
      setBooks((previous) => {
        const next = new Map(previous);
        for (const request of requests) {
          const key = bookKey(hub, request.typeId);
          const book = settled.get(key);
          if (book) next.set(key, book);
          else next.delete(key);
        }
        return next;
      });
      setChecking(wanted.length > 0);
      const ownIds = await loadOwnOrderIds();
      if (!cancelled) setOwn(ownIds);
      await loadLiveBooks(
        wanted,
        (request, result) => {
          settled.set(bookKey(hub, request.typeId), result);
          if (!cancelled) {
            setBooks((previous) => new Map(previous).set(bookKey(hub, request.typeId), result));
          }
        },
        { force }
      );
      if (!cancelled) setChecking(false);
      return mergeOutcome(base, percentRef.current, lookupFrom(settled, hub, ownIds));
    })();
    run.current = promise;
    void promise.finally(() => {
      if (run.current === promise) run.current = null;
    });

    return () => {
      cancelled = true;
    };
  }, [base, requests, hub]);

  // The other four hubs, only while Compare Hubs is open.
  useEffect(() => {
    if (base === null || !compareOpen || compareRequests.length === 0) return;
    const force = forceCompare.current;
    forceCompare.current = false;
    let cancelled = false;
    void (async () => {
      const wanted = compareRequests.filter((r) => force || peekLiveBook(r) === undefined);
      setCompareChecking(wanted.length > 0);
      setBooks((previous) => {
        const next = new Map(previous);
        for (const request of compareRequests) {
          const cached = force ? undefined : peekLiveBook(request);
          const key = bookKey(request.hub, request.typeId);
          if (cached) next.set(key, cached);
          else next.delete(key);
        }
        return next;
      });
      await loadLiveBooks(
        wanted,
        (request, result) => {
          if (cancelled) return;
          setBooks((previous) =>
            new Map(previous).set(bookKey(request.hub, request.typeId), result)
          );
        },
        { force }
      );
      if (!cancelled) setCompareChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [base, compareOpen, compareRequests]);

  const result = useMemo(() => {
    if (base === null || base.appraisal.items.length === 0) return base;
    return mergeOutcome(base, pricePercent, lookupFrom(books, hub, own));
  }, [base, books, hub, own, pricePercent]);

  useEffect(() => {
    latest.current = result;
  }, [result]);

  const compare = useMemo(() => {
    if (baseCompare === null || !baseCompare.some((row) => row.items?.length)) return baseCompare;
    return baseCompare.map((row): HubComparisonRow => {
      const items = row.items ?? [];
      if (items.length === 0) return row;
      const lookup = lookupFrom(books, row.hub, own);
      const applied = applyLiveBooks(items, lookup);
      const states = new Set<PriceState | undefined>(applied.map((item) => item.priceState));
      // Cards stay on their cached figure until every row has settled: half live and half cached would be a total of neither.
      if (states.has('cached')) return { ...row, priceState: 'cached' };
      const { buy, sell } = buildHubComparison(applied, pricePercent);
      return {
        ...row,
        buy,
        sell,
        priceState: states.has('failed') ? 'failed' : 'live',
      };
    });
  }, [baseCompare, books, own, pricePercent]);

  const live = useMemo(() => progressOf(books, requests, checking), [books, requests, checking]);
  const compareLive = useMemo(
    () => progressOf(books, compareRequests, compareChecking),
    [books, compareRequests, compareChecking]
  );

  const settle = useCallback(async () => (run.current ? await run.current : latest.current), []);
  const forceNextRun = useCallback(() => {
    forcePrimary.current = true;
    forceCompare.current = compareOpenRef.current;
  }, []);

  return { result, compare, live, compareLive, settle, forceNextRun };
}
