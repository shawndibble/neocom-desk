import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaletteProvider, PaletteResult } from './types';

export interface PaletteGroup {
  readonly provider: PaletteProvider;
  /**
   * `loading`: an async provider whose answer for this query has not landed.
   * `error`: its search rejected — shown in its own group, never the others.
   */
  readonly status: 'ready' | 'loading' | 'error';
  readonly results: readonly PaletteResult[];
}

interface SearchRun {
  readonly controller: AbortController;
  readonly entries: readonly {
    readonly provider: PaletteProvider;
    readonly answer: readonly PaletteResult[] | PromiseLike<readonly PaletteResult[]>;
  }[];
}

interface Settled {
  readonly run: SearchRun | null;
  /** `null` is a rejected search. */
  readonly results: ReadonlyMap<string, readonly PaletteResult[] | null>;
}

const NOTHING_SETTLED: Settled = { run: null, results: new Map() };

type Answer = SearchRun['entries'][number]['answer'];

/** Any thenable, not just a native Promise — a provider may hand back its client's own. */
function isPending(answer: Answer): answer is PromiseLike<readonly PaletteResult[]> {
  return typeof (answer as PromiseLike<unknown>).then === 'function';
}

/**
 * Runs every provider for `query` and returns the groups to render, in their
 * fixed order, empty ones hidden.
 *
 * Every provider is asked during render (memoised on the query), so a
 * synchronous group is in the very render that follows the keystroke — never
 * a frame behind an effect. An async one is `loading` until its Promise
 * settles; only its settlement touches state, keyed to the run that started
 * it, so an answer for a query the pilot has already typed past is dropped
 * (and its search aborted on the way out). Nothing here waits on anything:
 * the input is the caller's own state and re-renders on every keystroke.
 *
 * `providers` must be memoised by the caller — a new array is a new search.
 *
 * Known dev-only cost: StrictMode runs the memo twice, so an async provider
 * sees a second, discarded call whose signal never aborts. Its answer can
 * never land (only the kept run's settlements are read), so the cost is one
 * extra request in development, not wrong results.
 */
export function usePaletteSearch(
  providers: readonly PaletteProvider[],
  query: string
): PaletteGroup[] {
  const trimmed = query.trim();
  const run = useMemo<SearchRun>(() => {
    const controller = new AbortController();
    const entries = [...providers]
      .sort((a, b) => a.order - b.order)
      .filter((provider) => trimmed.length >= (provider.minQueryLength ?? 0))
      .map((provider) => {
        const answer = provider.search(trimmed, controller.signal);
        // Handled at once, not only by the effect below: a run React renders
        // but never commits (a render-phase restart, StrictMode's rehearsal)
        // never reaches that effect, and its rejection would go unhandled.
        if (isPending(answer)) answer.then(undefined, () => {});
        return { provider, answer };
      });
    return { controller, entries };
  }, [providers, trimmed]);

  const [settled, setSettled] = useState<Settled>(NOTHING_SETTLED);

  // The superseded run is aborted when its successor's effect starts, not in
  // this effect's cleanup: StrictMode's rehearsal unmount runs the cleanup and
  // then the same effect again over the same run, and a cleanup-time abort
  // would leave that run's searches dead before they answered. `active` is
  // what actually drops a stale answer.
  const previousRun = useRef<SearchRun | null>(null);
  useEffect(() => {
    if (previousRun.current !== run) previousRun.current?.controller.abort();
    previousRun.current = run;
    let active = true;
    const land = (id: string, results: readonly PaletteResult[] | null) => {
      if (!active) return;
      setSettled((previous) => ({
        run,
        results: new Map(previous.run === run ? previous.results : []).set(id, results),
      }));
    };
    for (const { provider, answer } of run.entries) {
      if (!isPending(answer)) continue;
      answer.then(
        (results) => land(provider.id, results),
        // A failed search errors its own group rather than taking the palette down.
        () => land(provider.id, null)
      );
    }
    return () => {
      active = false;
    };
  }, [run]);
  // No abort on unmount, for the same StrictMode reason: a closed palette's
  // last search just finishes into a `land` that is no longer active.

  const groups: PaletteGroup[] = [];
  for (const { provider, answer } of run.entries) {
    if (!isPending(answer)) {
      if (answer.length > 0) groups.push({ provider, status: 'ready', results: answer });
      continue;
    }
    const results = settled.run === run ? settled.results.get(provider.id) : undefined;
    if (results === undefined) groups.push({ provider, status: 'loading', results: [] });
    else if (results === null) groups.push({ provider, status: 'error', results: [] });
    else if (results.length > 0) groups.push({ provider, status: 'ready', results });
  }
  return groups;
}
