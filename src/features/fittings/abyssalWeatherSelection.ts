/**
 * The Abyssal weather the stats are worked out in — none by default. One pick
 * for the session, shared by the editor, its Variations, the applied-DPS
 * overlay and Fitting Compare, so every number on screen is in the same
 * weather. Not saved, and not carried in a Share Link: it's a question asked
 * of a fit ("how does it do in an Electrical 3?"), not part of the fit.
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { create } from 'zustand';
import { abyssalWeatherById, type AbyssalWeather } from '@/engine/fittings/abyssalWeather';

interface AbyssalWeatherSelection {
  /** A weather beacon's type id (`ABYSSAL_WEATHER`), or null for normal space. */
  weatherTypeId: number | null;
  setWeather: (weatherTypeId: number | null) => void;
}

export const useAbyssalWeather = create<AbyssalWeatherSelection>((set) => ({
  weatherTypeId: null,
  setWeather: (weatherTypeId) => set({ weatherTypeId }),
}));

/** "Electrical 3": a weather by kind and strength, as the picker and the stats heading both say it. */
export function abyssalWeatherLabel(t: TFunction, weather: AbyssalWeather): string {
  return t('fittings.weather.option', {
    kind: t(`fittings.weather.kind.${weather.kind}`),
    level: weather.level,
  });
}

/** The name of weather `weatherTypeId`, null for normal space — for a heading to say where the numbers are. */
export function useWeatherName(weatherTypeId: number | null): string | null {
  const { t } = useTranslation();
  const weather = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  return weather ? abyssalWeatherLabel(t, weather) : null;
}
