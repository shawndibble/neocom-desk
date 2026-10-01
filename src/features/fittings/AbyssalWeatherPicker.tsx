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

/**
 * Which Abyssal weather every number on the page is worked out in — the
 * editor's stats, Variations, the overlay and Compare (`useAbyssalWeather`) —
 * and, once one is picked, what it does at that strength.
 */
export function AbyssalWeatherPicker({
  field = false,
}: {
  /** In the stats column's `StatFields` grid: the label in its column, the weather's effect beneath. */
  field?: boolean;
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
      <StatField label={label} note={effect}>
        {select}
      </StatField>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-text-dim">{label}</span>
      {select}
      {effect && <span className="text-text-dim">{effect}</span>}
    </div>
  );
}
