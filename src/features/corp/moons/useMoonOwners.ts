import { useMemo } from 'react';
import {
  buildMoonOwners,
  hasOwnRefineries,
  type MoonOwnersInput,
} from '@/engine/corpTaxBook/moonOwners';
import { useBook } from './useBook';

/** The book's moon owners (feeders) as the tab and their page read them. */
export function useMoonOwners() {
  const { view, settings, data, corporationId } = useBook();
  const input = useMemo<MoonOwnersInput>(
    () => ({
      now: view.input.now,
      graceHours: settings.graceHours,
      bookCorporationId: corporationId,
      rates: settings.rates,
      entries: view.input.entries,
      feeders: data.feeders ?? [],
      pricesOn: (date) => view.input.pricesOn(date).prices,
    }),
    [view, settings, data.feeders, corporationId]
  );
  const built = useMemo(() => buildMoonOwners(input), [input]);
  const ownRefineries = useMemo(
    () => hasOwnRefineries(view.input.entries, data.state.extractions.length, corporationId),
    [view.input.entries, data.state.extractions.length, corporationId]
  );
  // A book with no moon owners yet may simply not have synced its own refineries: keep the tab.
  const showExtractions = ownRefineries || (data.feeders ?? []).length === 0;
  return { input, ...built, showExtractions };
}
