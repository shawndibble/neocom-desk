import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaletteProvider, PaletteResult } from './types';

export interface PaletteGroup {
  readonly provider: PaletteProvider;
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
  readonly results: ReadonlyMap<string, readonly PaletteResult[] | null>;
}

const NOTHING_SETTLED: Settled = { run: null, results: new Map() };

type Answer = SearchRun['entries'][number]['answer'];

function isPending(answer: Answer): answer is PromiseLike<readonly PaletteResult[]> {
  return typeof (answer as PromiseLike<unknown>).then === 'function';
}

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
        if (isPending(answer)) answer.then(undefined, () => {});
        return { provider, answer };
      });
    return { controller, entries };
  }, [providers, trimmed]);

  const [settled, setSettled] = useState<Settled>(NOTHING_SETTLED);

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
        () => land(provider.id, null)
      );
    }
    return () => {
      active = false;
    };
  }, [run]);

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
