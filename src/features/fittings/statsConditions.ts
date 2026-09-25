/**
 * The conditions every number on the Fittings pages is worked out under,
 * beyond the pilot and the Damage Profile: the Abyssal weather
 * (`abyssalWeatherSelection.ts`) and the "Overheat all" switch. One set for
 * the session, read by the editor, its Variations, the applied-DPS overlay
 * and Fitting Compare alike, so no two numbers on screen are in different
 * conditions. Neither is saved or put in a Share Link: each is a question
 * asked of a fit, not part of it.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import type { StatsOptions } from './dogmaFittingEngine';

interface OverheatAllSelection {
  overheatAll: boolean;
  setOverheatAll: (overheatAll: boolean) => void;
}

export const useOverheatAll = create<OverheatAllSelection>((set) => ({
  overheatAll: false,
  setOverheatAll: (overheatAll) => set({ overheatAll }),
}));

export interface StatsConditions {
  /** An Abyssal weather beacon's type id, or null for normal space. */
  weatherTypeId: number | null;
  overheatAll: boolean;
}

/** The session's conditions, one stable object while none of them changes. */
export function useStatsConditions(): StatsConditions {
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const overheatAll = useOverheatAll((state) => state.overheatAll);
  return useMemo(() => ({ weatherTypeId, overheatAll }), [weatherTypeId, overheatAll]);
}

/** The engine seam's options for `conditions`. */
export function statsOptions(conditions: StatsConditions): StatsOptions {
  return {
    ...(conditions.weatherTypeId === null ? {} : { weatherTypeId: conditions.weatherTypeId }),
    ...(conditions.overheatAll ? { overheatAll: true } : {}),
  };
}
