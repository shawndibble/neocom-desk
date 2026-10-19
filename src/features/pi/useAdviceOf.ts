/**
 * The PI tabs' advice for one `PlanAdviceInput`, built off the main thread
 * where the browser has a Worker and on the page where it has not (jsdom, a
 * failed worker). Same answer either way: both run `buildPlanAdvice`.
 *
 * `pending` holds from the moment the input changes until its answer lands, so
 * a caller never shows the previous input's figures under the new one. An
 * answer already in hand (a tab switch back) is returned on the first render.
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

export type AdviceOf =
  { status: 'pending' } | { status: 'error' } | { status: 'ready'; advice: PlanAdvice };

const PENDING: AdviceOf = { status: 'pending' };
const FAILED: AdviceOf = { status: 'error' };

function runOnPage(input: PlanAdviceInput): AdviceOf {
  try {
    return { status: 'ready', advice: buildSharedPlanAdvice(input) };
  } catch {
    return FAILED;
  }
}

function peeked(input: PlanAdviceInput): AdviceOf | null {
  const known = peekPlanAdvice(input);
  if (!known) return null;
  return 'advice' in known ? { status: 'ready', advice: known.advice } : FAILED;
}

/** Null input (still loading upstream) is `pending`. */
export function useAdviceOf(input: PlanAdviceInput | null): AdviceOf {
  const onPage = !planAdviceWorkerAvailable();
  const pageResult = useMemo(() => (onPage && input ? runOnPage(input) : null), [onPage, input]);
  const [landed, setLanded] = useState<{ input: PlanAdviceInput; result: AdviceOf } | null>(null);

  useEffect(() => {
    if (!input || onPage || peeked(input)) return;
    let live = true;
    askPlanAdvice(input).then(
      (advice) => live && setLanded({ input, result: { status: 'ready', advice } }),
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
    };
  }, [input, onPage]);

  if (!input) return PENDING;
  if (pageResult) return pageResult;
  return peeked(input) ?? (landed?.input === input ? landed.result : PENDING);
}
