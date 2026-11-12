import { useMemo } from 'react';
import {
  buildMoonOwners,
  extractionRefineriesOf,
  type MoonOwnersInput,
} from '@/engine/corpTaxBook/moonOwners';
import { useBook } from './useBook';

/** What the moon owners are built from; cheap, for a page or dialog that reads one owner. */
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
      // Read with the Moon owners tab's `owners` part; absent elsewhere, then priced from entries.
      ...(data.feederSummaries ? { summaries: data.feederSummaries } : {}),
      // A refinery with an Extraction counts before anyone mines there (#6097).
      extractionRefineries: extractionRefineriesOf(view.input.extractions),
      // The moon owner's page's prices (#4621), so the tab, Pay and that page owe one figure.
      pricesOn: view.input.moonOwnerPricesOn ?? ((date) => view.input.pricesOn(date).prices),
    }),
    [view, settings, data.feeders, data.feederSummaries, corporationId]
  );
}

/** The book's moon owners (feeders) as the tab reads them; only the tab builds every row. */
export function useMoonOwners() {
  const input = useMoonOwnersInput();
  const built = useMemo(() => buildMoonOwners(input), [input]);
  return { input, ...built };
}
