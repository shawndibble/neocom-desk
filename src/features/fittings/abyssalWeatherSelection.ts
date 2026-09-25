/**
 * The Abyssal weather the stats are worked out in — none by default. One pick
 * for the session, shared by the editor, its Variations, the applied-DPS
 * overlay and Fitting Compare, so every number on screen is in the same
 * weather. Not saved, and not carried in a Share Link: it's a question asked
 * of a fit ("how does it do in an Electrical 3?"), not part of the fit.
 */
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { abyssalWeatherById } from '@/engine/fittings/abyssalWeather';

interface AbyssalWeatherSelection {
  /** A weather beacon's type id (`ABYSSAL_WEATHER`), or null for normal space. */
  weatherTypeId: number | null;
  setWeather: (weatherTypeId: number | null) => void;
}

export const useAbyssalWeather = create<AbyssalWeatherSelection>((set) => ({
  weatherTypeId: null,
  setWeather: (weatherTypeId) => set({ weatherTypeId }),
}));

/** "Electrical 3" for the weather picked, null in normal space — for a heading to say where the numbers are. */
export function usePickedWeatherName(): string | null {
  const { t } = useTranslation();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const picked = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  if (!picked) return null;
  return t('fittings.weather.option', {
    kind: t(`fittings.weather.kind.${picked.kind}`),
    level: picked.level,
  });
}
