import { useMemo } from 'react';
import {
  buildMoonOwners,
  hasOwnRefineries,
  ownRefineriesFromStored,
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
      // The moon owner's page's prices (#4621), so the tab, Pay and that page owe one figure.
      pricesOn: view.input.moonOwnerPricesOn ?? ((date) => view.input.pricesOn(date).prices),
    }),
    [view, settings, data.feeders, data.feederSummaries, corporationId]
  );
}

/** Whether the Extractions tab shows: the corporation has refineries of its own. */
export function useShowExtractions(): boolean {
  const { view, data, corporationId } = useBook();
  const feederCount = (data.feeders ?? []).length;
  // An Extraction or no moon owner settles it from the held records, so the Moon owners tab
  // needs no ledger row for it; otherwise the page holds the rows (`useCorpBook`, #5717).
  const stored = ownRefineriesFromStored(data.state.extractions.length, feederCount);
  return useMemo(
    () =>
      stored ?? hasOwnRefineries(view.input.entries, data.state.extractions.length, corporationId),
    [stored, view.input.entries, data.state.extractions.length, corporationId]
  );
}

/** The book's moon owners (feeders) as the tab reads them; only the tab builds every row. */
export function useMoonOwners() {
  const input = useMoonOwnersInput();
  const built = useMemo(() => buildMoonOwners(input), [input]);
  return { input, ...built };
}
