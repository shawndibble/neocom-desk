/**
 * The words around a P3/P4 chain estimate: what it assumes, and the sentence
 * a tooltip or screen reader gets in place of the shorthand figure. One
 * source, so All products, the Map's tiles and its drawer say the same thing.
 */
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import type { ChainEstimateView } from './chainEstimateModel';

function typeName(t: TFunction, type: string): string {
  return t(`pi.planetType.${type}`);
}

/** "Multi-planet estimate, needs hauling: about 3,189,836 ISK a day across 3 planets". Whole ISK: the exact figure. */
export function chainFigureSentence(t: TFunction, view: ChainEstimateView): string {
  return t('piShared.chain.figure', {
    isk: formatIsk(view.iskPerDay, 0),
    count: view.planets.length,
  });
}

/** Every assumption behind the figure, in words. */
export function chainAssumptions(t: TFunction, view: ChainEstimateView): string {
  const counts = new Map<string, number>();
  for (const type of view.planets) counts.set(type, (counts.get(type) ?? 0) + 1);
  const types = [...counts]
    .map(([type, n]) => (n > 1 ? `${n}× ${typeName(t, type)}` : typeName(t, type)))
    .join(', ');
  const rate = Math.round(view.ratePerHour).toLocaleString('en');
  return [
    t('piShared.chain.assumesPlanets', {
      count: view.planets.length,
      types,
      host: typeName(t, view.hostType),
    }),
    t(view.ccAssumed ? 'piShared.chain.assumesCcGuess' : 'piShared.chain.assumesCc', {
      level: view.ccLevel,
    }),
    t(
      view.rateSource === 'measured'
        ? 'piShared.chain.assumesRateMeasured'
        : 'piShared.chain.assumesRateAssumed',
      { heads: view.headsPerExtractor, rate }
    ),
    t('piShared.chain.assumesSale'),
    t('piShared.chain.assumesHaul', {
      m3: Math.round(view.m3PerWeek).toLocaleString('en'),
      perHaul: Math.round(view.m3PerHaul).toLocaleString('en'),
      count: view.haulDays,
    }),
  ].join(' ');
}
