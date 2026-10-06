/**
 * Plan's Bigger chains, priced off the main render. Mounted only while the
 * pilot has opted in to hauling between planets, so nothing here runs (no
 * route counting, no solver) for anyone else.
 *
 * Each candidate runs the Goal Planner's solver a few dozen times, so they
 * are worked through one layout at a time between frames (`runSliced`, as
 * `useChainEstimates` does), and kept for the last set of assumptions: leaving
 * Plan and coming back does not price them again.
 *
 * `useWhatIfChains` prices the same chains with one planet type added, for
 * the types asked for (Plan: every type the pilot does not run; the Map: the
 * ticked what-if planet). One cache, so both tabs show the same figures and
 * the second never prices again.
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
/** What-if chains by planet type added, for the same inputs as `cached`. */
let whatIfCached: {
  key: string;
  byType: Map<PlanetType, Map<number, BiggerChainEstimates>>;
} | null = null;
/** The last jump count, so coming back to Plan neither recounts nor waits. */
let cachedPairs: { key: string; byPair: Map<string, number | null> } | null = null;

/** Test seam: forget every priced chain and counted jump. */
export function resetBiggerChains(): void {
  cached = null;
  whatIfCached = null;
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
  const [pairs, setPairs] = useState(cachedPairs);
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

interface ChainInputs {
  colonies: readonly PlannerColony[];
  /** The pilot's planet types, sorted. */
  types: PlanetType[];
  free: number;
  jumps: JumpsFn | undefined;
  /** The colonies, the assumptions, the jumps, the types and the free slots; null while counting jumps, or off. */
  key: string | null;
}

/** What both hooks price from, keyed once per input. Nothing is counted or keyed while `enabled` is off. */
function useChainInputs(advice: PlanAdvice, pi: PiData | null, enabled: boolean): ChainInputs {
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

export interface WhatIfChainsState {
  /** Each asked-for type priced so far: its chains by typeId (empty when it makes none possible). */
  byType: ReadonlyMap<PlanetType, ReadonlyMap<number, BiggerChainEstimates>>;
  /** A type asked for is still being priced (or jumps are still being counted). */
  pending: boolean;
}

/** Nothing asked for, nothing priced. */
export const NO_WHAT_IF_CHAINS: WhatIfChainsState = { byType: new Map(), pending: false };

type WhatIfUnit =
  | { type: PlanetType; typeId: number; layout: 'new' | 'colonies' }
  | { type: PlanetType; layout: 'done' };

const NO_TYPES: readonly PlanetType[] = [];

/**
 * The Bigger chains each of `wanted` would make possible, one planet type at a
 * time. Nothing runs (no route counting, no solver) while `wanted` is empty, so
 * a caller turns it off by asking for no type. A type lands whole, never one
 * chain at a time, so its line does not grow while it is priced.
 */
export function useWhatIfChains(
  advice: PlanAdvice,
  pi: PiData | null,
  wanted: readonly PlanetType[] = NO_TYPES
): WhatIfChainsState {
  const enabled = wanted.length > 0 && pi !== null;
  const { colonies, types, free, jumps, key } = useChainInputs(advice, pi, enabled);
  const wantedKey = wanted.join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (key === null || !pi) return;
    if (whatIfCached?.key !== key) whatIfCached = { key, byType: new Map() };
    const byType = whatIfCached.byType;
    const todo: WhatIfUnit[] = wanted
      .filter((type) => !byType.has(type))
      .flatMap((type) => [
        ...whatIfChainCandidates(colonies, type, pi).flatMap((typeId) => [
          { type, typeId, layout: 'new' as const },
          { type, typeId, layout: 'colonies' as const },
        ]),
        { type, layout: 'done' as const },
      ]);
    if (todo.length === 0) return;
    const partial = new Map<PlanetType, Map<number, BiggerChainEstimates>>();
    return runSliced(
      todo,
      (unit) => {
        const chains = partial.get(unit.type) ?? new Map<number, BiggerChainEstimates>();
        partial.set(unit.type, chains);
        if (unit.layout === 'done') {
          byType.set(unit.type, chains);
          return true;
        }
        const entry = chains.get(unit.typeId) ?? { colonies: null, newPlanets: null };
        if (unit.layout === 'new') {
          entry.newPlanets = estimateOnNewPlanetsWith(
            unit.typeId,
            unit.type,
            types,
            free,
            advice.chainBasis,
            pi
          );
        } else {
          entry.colonies = estimateOnColoniesWith(
            unit.typeId,
            unit.type,
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
    // `key` stands for the inputs, `wantedKey` for the types asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wantedKey]);

  return useMemo(() => {
    void version;
    const results = key !== null && whatIfCached?.key === key ? whatIfCached.byType : null;
    const asked = wantedKey === '' ? [] : (wantedKey.split(',') as PlanetType[]);
    const byType = new Map(
      asked.flatMap((type) => {
        const chains = results?.get(type);
        return chains ? [[type, chains] as const] : [];
      })
    );
    return { byType, pending: enabled && byType.size < asked.length };
  }, [key, version, wantedKey, enabled]);
}
