/**
 * Bigger chains (Plan) and what-if chains (Plan, the Map), priced off the main
 * render. Mounted only while the pilot hauls between planets, so nothing here
 * runs (no route counting, no solver) for anyone else.
 *
 * Each candidate runs the Goal Planner's solver a few dozen times, so they
 * are worked through one layout at a time between frames (`runSliced`, as
 * `useChainEstimates` does), and kept for the last set of assumptions: leaving
 * Plan and coming back does not price them again.
 *
 * `useWhatIfChains` prices the same chains with planet types added, for what
 * is asked for: a type alone (Plan: every type the pilot does not run, one at
 * a time) or a set of types added together (the Map: every ticked what-if
 * planet). Cached by inputs and `whatIfKey`: a tab with the same inputs as the
 * other reuses its figures.
 */
import { useEffect, useMemo, useState } from 'react';
import type { JumpsFn, PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import type { PiData } from '@/sde/types';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import {
  biggerChainCandidates,
  estimateOnColonies,
  estimateOnColoniesWith,
  estimateOnNewPlanets,
  estimateOnNewPlanetsWith,
  whatIfChainCandidates,
  whatIfKey,
  whatIfTypesOf,
  type BiggerChainEstimates,
} from './biggerChainsModel';
import { chainBasisKey } from './useChainEstimates';
import type { PlanAdvice } from './planAdviceModel';
import { runSliced } from './runSliced';

export interface BiggerChainsEstimateState {
  /** Every candidate priced so far, by typeId. */
  estimates: ReadonlyMap<number, BiggerChainEstimates>;
  /** P3s and P4s the pilot's planet types can make. */
  candidateCount: number;
  /** Still pricing (or still counting jumps). */
  pending: boolean;
}

let cached: { key: string; results: Map<number, BiggerChainEstimates> } | null = null;
/** What-if chains by `whatIfKey` of the types added, per set of inputs: Plan's and the Map's may differ. */
const whatIfCache = new Map<string, Map<string, Map<number, BiggerChainEstimates>>>();
const WHAT_IF_CACHE_SIZE = 4;

function whatIfResultsFor(key: string): Map<string, Map<number, BiggerChainEstimates>> {
  let byType = whatIfCache.get(key);
  if (!byType) {
    byType = new Map();
    whatIfCache.set(key, byType);
    while (whatIfCache.size > WHAT_IF_CACHE_SIZE) {
      whatIfCache.delete(whatIfCache.keys().next().value!);
    }
  }
  return byType;
}
/** The last jump count, so coming back to Plan neither recounts nor waits. */
let cachedPairs: { key: string; byPair: Map<string, number | null> } | null = null;

/** Test seam: forget every priced chain and counted jump. */
export function resetBiggerChains(): void {
  cached = null;
  whatIfCache.clear();
  cachedPairs = null;
}

/** The solver reads these fields; `ratePerEcu` is a Map, so it is spelled out. */
export function coloniesKey(colonies: readonly PlannerColony[]): string {
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
function useColonyJumps(
  systemOf: ReadonlyMap<number, number>,
  enabled: boolean
): {
  fn: JumpsFn | undefined;
  key: string | null;
} {
  const basis = useJumpBasis();
  const systemKey = [...new Set(systemOf.values())].sort((a, b) => a - b).join(',');
  const wanted = `${basis.key}|${systemKey}`;
  const [own, setPairs] = useState(cachedPairs);
  // Another hook on the page may have counted them since this one mounted.
  const pairs = own?.key === wanted ? own : cachedPairs?.key === wanted ? cachedPairs : own;
  useEffect(() => {
    if (!enabled || !basis.hydrated || pairs?.key === wanted) return;
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
  }, [basis, systemKey, wanted, enabled]);

  return useMemo(() => {
    if (!enabled || pairs?.key !== wanted) return { fn: undefined, key: null };
    const fn: JumpsFn = (from, to) => {
      if (to === 'hub') return null;
      const a = systemOf.get(from);
      const b = systemOf.get(to);
      if (a === undefined || b === undefined) return null;
      if (a === b) return 0;
      return pairs.byPair.get(a < b ? `${a}-${b}` : `${b}-${a}`) ?? null;
    };
    return { fn, key: wanted };
  }, [pairs, wanted, systemOf, enabled]);
}

export interface ChainInputs {
  colonies: readonly PlannerColony[];
  /** The pilot's planet types, sorted. */
  types: PlanetType[];
  free: number;
  jumps: JumpsFn | undefined;
  /** The colonies, the assumptions, the jumps, the types and the free slots; null while counting jumps, or off. */
  key: string | null;
}

/** What both hooks price from, keyed once per input. Nothing is counted or keyed while `enabled` is off. */
export function useChainInputs(
  advice: PlanAdvice,
  pi: PiData | null,
  enabled: boolean
): ChainInputs {
  const colonies = advice.chainColonies;
  const systemOf = useMemo(
    () => new Map(advice.colonies.map((colony) => [colony.planetId, colony.systemId])),
    [advice.colonies]
  );
  const jumps = useColonyJumps(systemOf, enabled);
  const types = useMemo(
    () => [...new Set(colonies.map((colony) => colony.planetType))].sort(),
    [colonies]
  );
  const free = advice.slots.free;
  // Both keys stringify price books and colonies: once per input, not once per slice's re-render.
  const basisKey = useMemo(
    () => (enabled && pi ? chainBasisKey(advice.chainBasis, pi) : null),
    [enabled, advice.chainBasis, pi]
  );
  const colonyKey = useMemo(() => (enabled ? coloniesKey(colonies) : null), [enabled, colonies]);
  const key =
    jumps.key === null || basisKey === null
      ? null
      : JSON.stringify([basisKey, colonyKey, jumps.key, types, free]);
  return { colonies, types, free, jumps: jumps.fn, key };
}

export function useBiggerChains(advice: PlanAdvice, pi: PiData): BiggerChainsEstimateState {
  const { colonies, types, free, jumps, key } = useChainInputs(advice, pi, true);
  const candidates = useMemo(() => biggerChainCandidates(colonies, pi), [colonies, pi]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null) return;
    if (cached?.key !== key) cached = { key, results: new Map() };
    const results = cached.results;
    // One unit is one layout of one product: the solver on real colonies can take a while.
    const todo = candidates
      .filter((typeId) => !results.has(typeId))
      // The cheap layout first, so a run cut short drops at most one solver result.
      .flatMap((typeId) => [
        { typeId, layout: 'new' as const },
        { typeId, layout: 'colonies' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<number, BiggerChainEstimates>();
    return runSliced(
      todo,
      ({ typeId, layout }) => {
        const entry = partial.get(typeId) ?? { colonies: null, newPlanets: null };
        if (layout === 'new') {
          entry.newPlanets = estimateOnNewPlanets(typeId, types, free, advice.chainBasis, pi);
          partial.set(typeId, entry);
        } else {
          entry.colonies = estimateOnColonies(typeId, colonies, advice.chainBasis, jumps, pi);
          partial.delete(typeId);
          results.set(typeId, entry);
        }
      },
      () => setVersion((v) => v + 1)
    );
    // `key` stands for the inputs.
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

export interface WhatIfChainsState {
  /** Each asked-for type or set priced so far, by `whatIfKey`: its chains by typeId (empty when it makes none possible). */
  byType: ReadonlyMap<string, ReadonlyMap<number, BiggerChainEstimates>>;
  /** Something asked for is still being priced (or jumps are still being counted). */
  pending: boolean;
}

/** Nothing asked for, nothing priced. */
export const NO_WHAT_IF_CHAINS: WhatIfChainsState = { byType: new Map(), pending: false };

type WhatIfUnit =
  { key: string; typeId: number; layout: 'new' | 'colonies' } | { key: string; layout: 'done' };

/** A planet type priced alone, or a set of them priced as one planet each, together. */
export type WhatIfAsk = PlanetType | readonly PlanetType[];

export const NO_TYPES: readonly PlanetType[] = [];

/**
 * The Bigger chains each of `wanted` would make possible: a planet type alone,
 * or a set of types added together (one new planet of each). Nothing runs (no
 * route counting, no solver) while `wanted` is empty, so a caller turns it off
 * by asking for nothing. An ask lands whole, never one chain at a time, so its
 * line does not grow while it is priced.
 */
export function useWhatIfChains(
  advice: PlanAdvice,
  pi: PiData | null,
  wanted: readonly WhatIfAsk[] = NO_TYPES
): WhatIfChainsState {
  const enabled = wanted.length > 0 && pi !== null;
  const { colonies, types, free, jumps, key } = useChainInputs(advice, pi, enabled);
  const wantedKey = wanted.map(whatIfKey).join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null || !pi) return;
    const byType = whatIfResultsFor(key);
    const todo: WhatIfUnit[] = wantedKey
      .split(',')
      .filter((asked) => asked !== '' && !byType.has(asked))
      .flatMap((asked) => [
        ...whatIfChainCandidates(colonies, whatIfTypesOf(asked), pi).flatMap((typeId) => [
          { key: asked, typeId, layout: 'new' as const },
          { key: asked, typeId, layout: 'colonies' as const },
        ]),
        { key: asked, layout: 'done' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<string, Map<number, BiggerChainEstimates>>();
    return runSliced(
      todo,
      (unit) => {
        const chains = partial.get(unit.key) ?? new Map<number, BiggerChainEstimates>();
        partial.set(unit.key, chains);
        if (unit.layout === 'done') {
          byType.set(unit.key, chains);
          // Another set of inputs may have evicted this one mid-run: put it back.
          if (whatIfCache.get(key) !== byType) whatIfCache.set(key, byType);
          return true;
        }
        const entry = chains.get(unit.typeId) ?? { colonies: null, newPlanets: null };
        // Sorted, so each added planet keeps the id `whatIfPlanetId` gives it.
        const added = whatIfTypesOf(unit.key);
        if (unit.layout === 'new') {
          entry.newPlanets = estimateOnNewPlanetsWith(
            unit.typeId,
            added,
            types,
            free,
            advice.chainBasis,
            pi
          );
        } else {
          entry.colonies = estimateOnColoniesWith(
            unit.typeId,
            added,
            colonies,
            free,
            advice.chainBasis,
            jumps,
            pi
          );
        }
        chains.set(unit.typeId, entry);
        return false;
      },
      (landed) => {
        if (landed) setVersion((v) => v + 1);
      }
    );
    // `key` stands for the inputs, `wantedKey` for what is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wantedKey]);

  return useMemo(() => {
    void version;
    const results = key !== null ? whatIfCache.get(key) : undefined;
    const asked = wantedKey === '' ? [] : wantedKey.split(',');
    const byType = new Map(
      asked.flatMap((ask) => {
        const chains = results?.get(ask);
        return chains ? [[ask, chains] as const] : [];
      })
    );
    return { byType, pending: enabled && byType.size < asked.length };
  }, [key, version, wantedKey, enabled]);
}
