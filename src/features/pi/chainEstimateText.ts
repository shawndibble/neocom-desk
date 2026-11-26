import { formatCount } from '@/lib/formatCount';
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import type { ChainEstimateView } from './chainEstimateModel';

function typeName(t: TFunction, type: string): string {
  return t(`pi.planetType.${type}`);
}

export function chainFigureSentence(t: TFunction, view: ChainEstimateView): string {
  return t('piShared.chain.figure', {
    isk: formatIsk(view.iskPerDay, 0),
    count: view.planets.length,
  });
}

export function planetTypeList(t: TFunction, planets: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const type of planets) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts]
    .map(([type, n]) =>
      n > 1
        ? t('piShared.chain.typeCount', { count: n, type: typeName(t, type) })
        : typeName(t, type)
    )
    .join(', ');
}

export function chainAssumptions(t: TFunction, view: ChainEstimateView): string {
  const types = planetTypeList(t, view.planets);
  const rate = formatCount(view.ratePerHour);
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
      m3: formatCount(view.m3PerWeek),
      perHaul: formatCount(view.m3PerHaul),
      count: view.haulDays,
    }),
  ].join(' ');
}
