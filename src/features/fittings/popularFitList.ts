import { nullsLast } from '@/engine/math';

export type FitSource = 'loss' | 'guide';
export type FitSourceFilter = 'all' | FitSource;
export type FitSort = 'newest' | 'seen' | 'training' | 'cheapest';

export interface ListedFit {
  key: string;
  source: FitSource;
  newest: number | null;
  seen: number;
  isk: number | null;
}

export interface FitListOptions {
  source: FitSourceFilter;
  flyOnly: boolean;
  sort: FitSort;
}

export interface FitVerdictLookup {
  canFly: (key: string) => boolean | undefined;
  seconds: (key: string) => number | undefined;
}

export function sourceCounts(fits: readonly ListedFit[]): Record<FitSourceFilter, number> {
  const loss = fits.filter((fit) => fit.source === 'loss').length;
  return { all: fits.length, loss, guide: fits.length - loss };
}

export function listFits<T extends ListedFit>(
  fits: readonly T[],
  { source, flyOnly, sort }: FitListOptions,
  verdicts: FitVerdictLookup
): T[] {
  const training = (fit: ListedFit) =>
    verdicts.canFly(fit.key) === true ? 0 : (verdicts.seconds(fit.key) ?? null);
  const compare: Record<FitSort, (a: T, b: T) => number> = {
    newest: (a, b) => nullsLast(a.newest, b.newest, -1),
    seen: (a, b) => b.seen - a.seen || nullsLast(a.newest, b.newest, -1),
    cheapest: (a, b) => nullsLast(a.isk, b.isk, 1),
    training: (a, b) => nullsLast(training(a), training(b), 1) || nullsLast(a.newest, b.newest, -1),
  };
  return fits
    .filter((fit) => source === 'all' || fit.source === source)
    .filter((fit) => !flyOnly || verdicts.canFly(fit.key) === true)
    .sort(compare[sort]);
}

export function closestFit<T extends ListedFit>(
  fits: readonly T[],
  seconds: (key: string) => number | undefined
): T | undefined {
  let best: T | undefined;
  let bestSeconds = Infinity;
  for (const fit of fits) {
    const s = seconds(fit.key);
    if (s !== undefined && s > 0 && s < bestSeconds) {
      best = fit;
      bestSeconds = s;
    }
  }
  return best;
}
