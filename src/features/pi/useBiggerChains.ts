/**
 * Plan's Bigger chains, priced off the main render. Mounted only while the
 * pilot has opted in to hauling between planets, so nothing here runs (no
 * route counting, no solver) for anyone else.
 *
 * Each candidate runs the Goal Planner's solver a few dozen times, so they
 * are worked through one layout at a time between frames, the way
 * `useChainEstimates` does, and kept for the last set of assumptions: leaving
 * Plan and coming back does not price them again.
 */
import { useEffect, useMemo, useState } from 'react';
import type { JumpsFn, PlannerColony } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import {
  biggerChainCandidates,
  estimateOnColonies,
  estimateOnNewPlanets,
  type BiggerChainEstimates,
} from './biggerChainsModel';
import { chainBasisKey } from './useChainEstimates';
import type { PlanAdvice } from './planAdviceModel';

export interface BiggerChainsEstimateState {
  /** Every candidate priced so far, by typeId. */
  estimates: ReadonlyMap<number, BiggerChainEstimates>;
  /** P3s and P4s the pilot's planet types can make. */
  candidateCount: number;
  /** Still pricing (or still counting jumps). */
  pending: boolean;
}

/** Longest a slice runs before yielding to the browser, in ms. */
const SLICE_MS = 30;

let cached: { key: string; results: Map<number, BiggerChainEstimates> } | null = null;
/** The last jump count, so coming back to Plan neither recounts nor waits. */
let cachedPairs: { key: string; byPair: Map<string, number | null> } | null = null;

/** Test seam: forget every priced chain and counted jump. */
export function resetBiggerChains(): void {
  cached = null;
  cachedPairs = null;
}

/** The solver reads these fields; `ratePerEcu` is a Map, so it is spelled out. */
function coloniesKey(colonies: readonly PlannerColony[]): string {
  return JSON.stringify(
    colonies.map((c) => [
      c.planetId,
      c.planetType,
      c.budget,
      c.newLinkCost,
      c.headsPerExtractor,
      c.taxRate,
      [...c.ratePerEcu].map(([id, rate]) => [id, rate.unitsPerHour, rate.source]),
      c.current.p0TypeIds,
      c.current.productTypeIds,
      c.current.ecusByP0 ? [...c.current.ecusByP0] : null,
    ])
  );
}

/**
 * Jumps between the pilot's colony systems under the Route Safety basis, as
 * the Goal Planner counts them. `undefined` while counting; a function once
 * known (a pair with no route answers null, never zero).
 */
function useColonyJumps(systemOf: ReadonlyMap<number, number>): {
  fn: JumpsFn | undefined;
  key: string | null;
} {
  const basis = useJumpBasis();
  const systemKey = [...new Set(systemOf.values())].sort((a, b) => a - b).join(',');
  const wanted = `${basis.key}|${systemKey}`;
  const [pairs, setPairs] = useState(cachedPairs);
  useEffect(() => {
    if (!basis.hydrated || pairs?.key === wanted) return;
    let cancelled = false;
    const ids = systemKey === '' ? [] : systemKey.split(',').map(Number);
    const pairIds = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const));
    void Promise.all(
      pairIds.map(([a, b]) =>
        jumpsBetween(a, b, basis)
          .then((r) => (r.kind === 'known' ? r.jumps : null))
          .catch(() => null)
      )
    ).then((between) => {
      if (cancelled) return;
      cachedPairs = {
        key: wanted,
        byPair: new Map(pairIds.map(([a, b], i) => [`${a}-${b}`, between[i]])),
      };
      setPairs(cachedPairs);
    });
    return () => {
      cancelled = true;
    };
    // `pairs` is only read to skip a count already made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, systemKey, wanted]);

  return useMemo(() => {
    if (pairs?.key !== wanted) return { fn: undefined, key: null };
    const fn: JumpsFn = (from, to) => {
      if (to === 'hub') return null;
      const a = systemOf.get(from);
      const b = systemOf.get(to);
      if (a === undefined || b === undefined) return null;
      if (a === b) return 0;
      return pairs.byPair.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? null;
    };
    return { fn, key: wanted };
  }, [pairs, wanted, systemOf]);
}

export function useBiggerChains(advice: PlanAdvice, pi: PiData): BiggerChainsEstimateState {
  const colonies = advice.chainColonies;
  const systemOf = useMemo(
    () => new Map(advice.colonies.map((colony) => [colony.planetId, colony.systemId])),
    [advice.colonies]
  );
  const jumps = useColonyJumps(systemOf);
  const types = useMemo(
    () => [...new Set(colonies.map((colony) => colony.planetType))].sort(),
    [colonies]
  );
  const free = advice.slots.free;
  const candidates = useMemo(() => biggerChainCandidates(colonies, pi), [colonies, pi]);
  // Both keys stringify price books and colonies: once per input, not once per slice's re-render.
  const basisKey = useMemo(() => chainBasisKey(advice.chainBasis, pi), [advice.chainBasis, pi]);
  const colonyKey = useMemo(() => coloniesKey(colonies), [colonies]);
  const key =
    jumps.key === null ? null : JSON.stringify([basisKey, colonyKey, jumps.key, types, free]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null) return;
    if (cached?.key !== key) cached = { key, results: new Map() };
    const results = cached.results;
    // One unit is one layout of one product: the solver on real colonies can take a while.
    const todo = candidates
      .filter((typeId) => !results.has(typeId))
      .flatMap((typeId) => [
        { typeId, layout: 'colonies' as const },
        { typeId, layout: 'new' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<number, BiggerChainEstimates>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slice = () => {
      const start = performance.now();
      while (todo.length > 0 && performance.now() - start < SLICE_MS) {
        const { typeId, layout } = todo.shift()!;
        const entry = partial.get(typeId) ?? { colonies: null, newPlanets: null };
        if (layout === 'colonies') {
          entry.colonies = estimateOnColonies(typeId, colonies, advice.chainBasis, jumps.fn, pi);
          partial.set(typeId, entry);
        } else {
          entry.newPlanets = estimateOnNewPlanets(typeId, types, free, advice.chainBasis, pi);
          partial.delete(typeId);
          results.set(typeId, entry);
        }
      }
      setVersion((v) => v + 1);
      if (todo.length > 0) timer = setTimeout(slice, 0);
    };
    timer = setTimeout(slice, 0);
    return () => clearTimeout(timer);
    // `key` stands for the colonies, the assumptions, the jumps, the types and the free slots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    void version;
    const results = key !== null && cached?.key === key ? cached.results : null;
    const estimates = new Map(
      candidates.flatMap((typeId) => {
        const entry = results?.get(typeId);
        return entry ? [[typeId, entry] as const] : [];
      })
    );
    return {
      estimates,
      candidateCount: candidates.length,
      pending: key === null || estimates.size < candidates.length,
    };
  }, [key, version, candidates]);
}
