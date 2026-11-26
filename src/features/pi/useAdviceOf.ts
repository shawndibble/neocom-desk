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

const lastReadyOf = new WeakMap<object, AdviceOf>();

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
