import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { create } from 'zustand';
import { abyssalWeatherById, type AbyssalWeather } from '@/engine/fittings/abyssalWeather';

interface AbyssalWeatherSelection {
  weatherTypeId: number | null;
  setWeather: (weatherTypeId: number | null) => void;
}

export const useAbyssalWeather = create<AbyssalWeatherSelection>((set) => ({
  weatherTypeId: null,
  setWeather: (weatherTypeId) => set({ weatherTypeId }),
}));

export function abyssalWeatherLabel(t: TFunction, weather: AbyssalWeather): string {
  return t('fittings.weather.option', {
    kind: t(`fittings.weather.kind.${weather.kind}`),
    level: weather.level,
  });
}

export function useWeatherName(weatherTypeId: number | null): string | null {
  const { t } = useTranslation();
  const weather = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  return weather ? abyssalWeatherLabel(t, weather) : null;
}
