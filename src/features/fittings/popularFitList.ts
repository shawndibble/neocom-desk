/**
 * The Popular fits panel's one merged list (zKillboard losses and EVE Workbench
 * guides together): what each source contributes to the filter's counts, and
 * the filtered, sorted order. Pure, so the panel only maps its rows in and out.
 */

import { nullsLast } from '@/engine/math';

export type FitSource = 'loss' | 'guide';
export type FitSourceFilter = 'all' | FitSource;
export type FitSort = 'newest' | 'seen' | 'training' | 'cheapest';

/** A row's sort keys, whichever source it came from. */
export interface ListedFit {
  key: string;
  source: FitSource;
  /** Last seen (a loss) or published (a guide), epoch ms; null when unknown. */
  newest: number | null;
  /** Recent zKillboard losses with this fit. */
  seen: number;
  /** A loss's mean value, or a guide's price at the trade hub; null unpriced. */
  isk: number | null;
}

export interface FitListOptions {
  source: FitSourceFilter;
  /** Keep only fits the Character can fly now. */
  flyOnly: boolean;
  sort: FitSort;
}

export interface FitVerdictLookup {
  /** Whether the Character can fly the fit; undefined with no verdict. */
  canFly: (key: string) => boolean | undefined;
  /** Training left before the Character can fly it; undefined when not known. */
  seconds: (key: string) => number | undefined;
}

/** Each source's size and the whole: the source filter's counts, which no other filter changes. */
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

/** The fit with the least training left, for "nothing you can fly yet"; undefined with none timed. */
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
