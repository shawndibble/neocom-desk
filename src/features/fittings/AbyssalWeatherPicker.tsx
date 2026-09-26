import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  ABYSSAL_WEATHER,
  ABYSSAL_WEATHER_KINDS,
  abyssalWeatherById,
} from '@/engine/fittings/abyssalWeather';
import { abyssalWeatherLabel, useAbyssalWeather } from './abyssalWeatherSelection';

const NORMAL_SPACE = 'none';

/**
 * Which Abyssal weather every number on the page is worked out in — the
 * editor's stats, Variations, the overlay and Compare (`useAbyssalWeather`) —
 * and, once one is picked, what it does at that strength.
 */
export function AbyssalWeatherPicker() {
  const { t } = useTranslation();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const setWeather = useAbyssalWeather((state) => state.setWeather);
  const label = t('fittings.weather.label');
  const picked = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-text-dim">{label}</span>
      <Select
        value={picked ? String(picked.typeId) : NORMAL_SPACE}
        onValueChange={(value) => setWeather(value === NORMAL_SPACE ? null : Number(value))}
      >
        <SelectTrigger aria-label={label} size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NORMAL_SPACE}>{t('fittings.weather.none')}</SelectItem>
          <SelectSeparator />
          {ABYSSAL_WEATHER_KINDS.map((kind) => (
            <SelectGroup key={kind}>
              <SelectLabel>{t(`fittings.weather.kind.${kind}`)}</SelectLabel>
              {ABYSSAL_WEATHER.filter((weather) => weather.kind === kind).map((weather) => (
                <SelectItem key={weather.typeId} value={String(weather.typeId)}>
                  {abyssalWeatherLabel(t, weather)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {picked && (
        <span className="text-text-dim">
          {t(`fittings.weather.effect.${picked.kind}`, {
            penalty: picked.penaltyPercent,
          })}
        </span>
      )}
    </div>
  );
}
