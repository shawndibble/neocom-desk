import { useMemo } from 'react';
import {
  billedPricesOf,
  buildMoonOwners,
  extractionRefineriesOf,
  type MoonOwnersInput,
} from '@/engine/corpTaxBook/moonOwners';
import { useBook } from './useBook';

export function useMoonOwnersInput(): MoonOwnersInput {
  const { view, settings, data, corporationId } = useBook();
  return useMemo<MoonOwnersInput>(
    () => ({
      now: view.input.now,
      graceHours: settings.graceHours,
      bookCorporationId: corporationId,
      rates: settings.rates,
      entries: view.input.entries,
      feeders: data.feeders ?? [],
      ...(data.feederSummaries ? { summaries: data.feederSummaries } : {}),
      extractionRefineries: extractionRefineriesOf(view.input.extractions),
      pricesOn: view.input.moonOwnerPricesOn ?? ((date) => view.input.pricesOn(date).prices),
      billedPrices: billedPricesOf(view.input.notices),
    }),
    [view, settings, data.feeders, data.feederSummaries, corporationId]
  );
}

export function useMoonOwners() {
  const input = useMoonOwnersInput();
  const built = useMemo(() => buildMoonOwners(input), [input]);
  return { input, ...built };
}
