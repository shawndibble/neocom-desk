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
const contents = new WeakMap<object, string>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

/** A price book by content, once per object: a buyback builds a new object with the same values each time. */
function contentKey(book: Readonly<Record<number, number>>): string {
  let key = contents.get(book);
  if (key === undefined) {
    key = JSON.stringify(book);
    contents.set(book, key);
  }
  return key;
}

/** The SDE payload by identity: a new bake is new work. */
function objectId(value: object): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = nextObjectId++;
    objectIds.set(value, id);
  }
  return id;
}

export function chainBasisKey(basis: ChainBasis, pi: PiData): string {
  const { books, ...rest } = basis;
  return JSON.stringify([
    objectId(pi),
    rest,
    books.salesTaxPct,
    contentKey(books.prices),
    contentKey(books.revenuePrices),
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
  const key = basis && pi ? chainBasisKey(basis, pi) : null;
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
      // Another assumption set may have evicted this one mid-run: put it back before rendering from it.
      if (cache.get(key) !== results) cache.set(key, results);
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
