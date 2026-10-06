/**
 * The P3/P4 chain estimates, priced off the main render and shared by every
 * surface that shows them (All products, the Map's tiles and its drawer).
 *
 * One estimate runs the Goal Planner's solver a few dozen times, and there are
 * about thirty P3s and P4s: too much to run inside a render without the Map
 * stalling as it opens. So they are worked through in short slices between
 * frames, each surface showing "needs N planets" until its figure lands, and
 * kept in a small module cache keyed by the assumptions: the Map rebuilds its
 * advice for every what-if planet, and none of those change a chain's figure.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PiData } from '@/sde/types';
import {
  buildChainEstimate,
  chainProductIds,
  type ChainBasis,
  type ChainEstimateView,
} from './chainEstimateModel';

/** `undefined` while still being priced; null when there is no figure. */
export type ChainEstimateOf = (typeId: number) => ChainEstimateView | null | undefined;

/** Longest a slice runs before yielding to the browser, in ms. */
const SLICE_MS = 30;
/** Assumption sets kept; a pref change or a buyback toggle makes a new one. */
const CACHE_SIZE = 4;

const cache = new Map<string, Map<number, ChainEstimateView | null>>();
const fingerprints = new WeakMap<object, string>();

/** Cheap content key for a price book: a buyback builds a new object each time with the same values. */
function fingerprint(book: Readonly<Record<number, number>>): string {
  const known = fingerprints.get(book);
  if (known) return known;
  let count = 0;
  let sum = 0;
  for (const [id, price] of Object.entries(book)) {
    count += 1;
    sum += price * ((Number(id) % 997) + 1);
  }
  const key = `${count}:${sum}`;
  fingerprints.set(book, key);
  return key;
}

export function chainBasisKey(basis: ChainBasis): string {
  const { books, ...rest } = basis;
  return JSON.stringify([
    rest,
    books.salesTaxPct,
    fingerprint(books.prices),
    fingerprint(books.revenuePrices),
  ]);
}

function resultsFor(key: string): Map<number, ChainEstimateView | null> {
  let results = cache.get(key);
  if (!results) {
    results = new Map();
    cache.set(key, results);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return results;
}

/** Test seam: forget every priced estimate. */
export function resetChainEstimates(): void {
  cache.clear();
}

export function useChainEstimates(basis: ChainBasis | null, pi: PiData | null): ChainEstimateOf {
  const key = basis ? chainBasisKey(basis) : null;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!basis || !pi || key === null) return;
    const results = resultsFor(key);
    const todo = chainProductIds(pi).filter((typeId) => !results.has(typeId));
    if (todo.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slice = () => {
      const start = performance.now();
      while (todo.length > 0 && performance.now() - start < SLICE_MS) {
        const typeId = todo.shift()!;
        results.set(typeId, buildChainEstimate(typeId, basis, pi));
      }
      setVersion((v) => v + 1);
      if (todo.length > 0) timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 0);
    return () => clearTimeout(timer);
    // `key` stands for `basis`: a new object with the same assumptions is the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pi]);

  return useMemo<ChainEstimateOf>(() => {
    void version;
    if (key === null) return () => null;
    // Before the first slice lands there is no map yet: every figure is pending.
    const results = cache.get(key);
    return (typeId) => results?.get(typeId);
  }, [key, version]);
}
