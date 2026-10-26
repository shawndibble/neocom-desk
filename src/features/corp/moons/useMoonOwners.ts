import { useMemo } from 'react';
import {
  buildMoonOwners,
  hasOwnRefineries,
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
      // The moon owner's page's prices (#4621), so the tab, Pay and that page owe one figure.
      pricesOn: view.input.moonOwnerPricesOn ?? ((date) => view.input.pricesOn(date).prices),
    }),
    [view, settings, data.feeders, corporationId]
  );
}

/** Whether the Extractions tab shows: the corporation has refineries of its own. */
export function useShowExtractions(): boolean {
  const { view, data, corporationId } = useBook();
  const ownRefineries = useMemo(
    () => hasOwnRefineries(view.input.entries, data.state.extractions.length, corporationId),
    [view.input.entries, data.state.extractions.length, corporationId]
  );
  // A book with no moon owners yet may simply not have synced its own refineries: keep the tab.
  return ownRefineries || (data.feeders ?? []).length === 0;
}

/** The book's moon owners (feeders) as the tab reads them; only the tab builds every row. */
export function useMoonOwners() {
  const input = useMoonOwnersInput();
  const built = useMemo(() => buildMoonOwners(input), [input]);
  return { input, ...built };
}
