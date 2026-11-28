import type { ReactNode } from 'react';
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
import { StatField } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';

const NORMAL_SPACE = 'none';

export function AbyssalWeatherPicker({
  field = false,
  info,
}: {
  field?: boolean;
  info?: ReactNode;
} = {}) {
  const { t } = useTranslation();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const setWeather = useAbyssalWeather((state) => state.setWeather);
  const label = t('fittings.weather.label');
  const picked = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);

  const effect = picked
    ? t(`fittings.weather.effect.${picked.kind}`, { penalty: picked.penaltyPercent })
    : undefined;
  const select = (
    <Select
      value={picked ? String(picked.typeId) : NORMAL_SPACE}
      onValueChange={(value) => setWeather(value === NORMAL_SPACE ? null : Number(value))}
    >
      <SelectTrigger aria-label={label} size="sm" className={STAT_FIELD_WIDTH}>
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
  );
  if (field)
    return (
      <StatField
        label={
          info ? (
            <span className="inline-flex items-center gap-1.5">
              {label}
              {info}
            </span>
          ) : (
            label
          )
        }
        note={effect}
      >
        {select}
      </StatField>
    );
  return (
    <>
      {select}
      {effect && <span className="text-xs text-text-dim">{effect}</span>}
    </>
  );
}
