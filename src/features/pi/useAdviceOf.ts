/**
 * The PI tabs' advice for one `PlanAdviceInput`, built off the main thread
 * where the browser has a Worker and on the page where it has not (jsdom, a
 * failed worker). Same answer either way: both run `buildPlanAdvice`.
 *
 * An answer already in hand (a tab switch back) is returned on the first
 * render. While a new input's answer is on its way, the previous answer stays
 * if it was built from the same colonies (a preference, market or route
 * change) or the same pilot's colonies read again (`snapshotLineage`: a page
 * refresh), so the board does not blank and lose its place; for any other
 * input it is `pending`, never another pilot's figures.
 */
import { useEffect, useMemo, useState } from 'react';
import { buildSharedPlanAdvice } from './planAdviceModel';
import type { PlanAdvice, PlanAdviceInput } from './planAdvice/types';
import {
  askPlanAdvice,
  peekPlanAdvice,
  planAdviceWorkerAvailable,
  PlanAdviceWorkerUnavailable,
} from './planAdviceService';
import { lineageOf } from './snapshotLineage';

export type AdviceOf =
  { status: 'pending' } | { status: 'error' } | { status: 'ready'; advice: PlanAdvice };

const PENDING: AdviceOf = { status: 'pending' };
const FAILED: AdviceOf = { status: 'error' };

/** The newest ready answer per snapshot lineage: what a pending input falls back to. */
const lastReadyOf = new WeakMap<object, AdviceOf>();

/** One result object per advice, so a caller's memo keyed on it holds across renders. */
const readyOf = new WeakMap<PlanAdvice, AdviceOf>();

function ready(advice: PlanAdvice): AdviceOf {
  let hit = readyOf.get(advice);
  if (!hit) readyOf.set(advice, (hit = { status: 'ready', advice }));
  return hit;
}

function runOnPage(input: PlanAdviceInput): AdviceOf {
  try {
    return ready(buildSharedPlanAdvice(input));
  } catch {
    return FAILED;
  }
}

function peeked(input: PlanAdviceInput): AdviceOf | null {
  const known = peekPlanAdvice(input);
  if (!known) return null;
  return 'advice' in known ? ready(known.advice) : FAILED;
}

/** Null input (still loading upstream) is `pending`. */
export function useAdviceOf(input: PlanAdviceInput | null): AdviceOf {
  const onPage = !planAdviceWorkerAvailable();
  const pageResult = useMemo(() => (onPage && input ? runOnPage(input) : null), [onPage, input]);
  const [landed, setLanded] = useState<{ input: PlanAdviceInput; result: AdviceOf } | null>(null);

  useEffect(() => {
    if (!input || onPage || peeked(input)) return;
    let live = true;
    const abort = new AbortController();
    askPlanAdvice(input, abort.signal).then(
      (advice) => live && setLanded({ input, result: ready(advice) }),
      (error: unknown) => {
        if (!live) return;
        setLanded({
          input,
          result: error instanceof PlanAdviceWorkerUnavailable ? runOnPage(input) : FAILED,
        });
      }
    );
    return () => {
      live = false;
      abort.abort();
    };
  }, [input, onPage]);

  const result = input
    ? (pageResult ?? peeked(input) ?? (landed?.input === input ? landed.result : null))
    : null;

  if (!input) return PENDING;
  if (result) {
    if (result.status === 'ready') lastReadyOf.set(lineageOf(input.snapshot), result);
    return result;
  }
  return lastReadyOf.get(lineageOf(input.snapshot)) ?? PENDING;
}
