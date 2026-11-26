import { useEffect, useMemo, useState } from 'react';
import type { PiData } from '@/sde/types';
import {
  buildChainEstimate,
  chainProductIds,
  type ChainBasis,
  type ChainEstimateView,
} from './chainEstimateModel';
import { runSliced } from './runSliced';

export type ChainEstimateOf = (typeId: number) => ChainEstimateView | null | undefined;

const CACHE_SIZE = 4;

const cache = new Map<string, Map<number, ChainEstimateView | null>>();
const contents = new WeakMap<object, string>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function contentKey(book: Readonly<Record<number, number>>): string {
  let key = contents.get(book);
  if (key === undefined) {
    key = JSON.stringify(book);
    contents.set(book, key);
  }
  return key;
}

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
    return runSliced(
      todo,
      (typeId) => {
        const view = buildChainEstimate(typeId, basis, pi);
        results.set(typeId, view);
        return view !== null;
      },
      (landed, done) => {
        if (cache.get(key) !== results) cache.set(key, results);
        if (landed || done) setVersion((v) => v + 1);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pi]);

  return useMemo<ChainEstimateOf>(() => {
    void version;
    if (key === null) return () => null;
    const results = cache.get(key);
    return (typeId) => results?.get(typeId);
  }, [key, version]);
}
