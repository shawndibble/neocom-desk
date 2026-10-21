import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import {
  ABYSSAL_POCKETS,
  ABYSSAL_RUN_MINUTES,
  ABYSSAL_SECURITY_BANDS,
  ABYSSAL_TIERS,
  abyssalActivation,
  abyssalFilamentTypeId,
  abyssalHullRule,
  abyssalTierLevels,
  abyssalTiersRolling,
  weaponReachChange,
  type AbyssalSecurity,
  type WeaponReachChange,
  type AbyssalTier,
} from '@/engine/fittings/abyssalRun';
import {
  abyssalWeatherById,
  abyssalWeatherOf,
  type AbyssalWeather,
} from '@/engine/fittings/abyssalWeather';
import { diffFittingStats, type StatChange } from '@/engine/fittings/variationDelta';
import type { FittingStats } from '@/engine/fittings/types';
import { abyssalWeatherLabel, useAbyssalWeather, useWeatherName } from './abyssalWeatherSelection';
import { AbyssalWeatherPicker } from './AbyssalWeatherPicker';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { changeLabel } from './fittingVariationsCsv';
import { StatField, StatFields, StatNote } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';
import { kmValue } from './rangeText';
import { fixed1 } from '@/lib/fixedFormat';

export type WeatherCompare = (
  weatherTypeId: number
) => Promise<{ before: FittingStats; after: FittingStats }>;

interface RunDelta {
  changes: StatChange[];
  reach: WeaponReachChange | null;
}

/**
 * What the weather does to the open fit, as the page's own stats would show it:
 * null while working, 'failed' if the engine threw. Keyed by `compare` too, so
 * an edited fit never shows the old fit's delta.
 */
function useRunDelta(
  compare: WeatherCompare | null,
  weatherTypeId: number | null
): RunDelta | 'failed' | null {
  const [result, setResult] = useState<{
    compare: WeatherCompare;
    weatherTypeId: number;
    delta: RunDelta | 'failed';
  } | null>(null);
  useEffect(() => {
    if (compare === null || weatherTypeId === null) return;
    let cancelled = false;
    const settle = (delta: RunDelta | 'failed') => {
      if (!cancelled) setResult({ compare, weatherTypeId, delta });
    };
    void compare(weatherTypeId).then(
      ({ before, after }) =>
        settle({
          changes: diffFittingStats(before, after).changes,
          reach: weaponReachChange(before, after),
        }),
      () => settle('failed')
    );
    return () => {
      cancelled = true;
    };
  }, [compare, weatherTypeId]);
  return result !== null && result.compare === compare && result.weatherTypeId === weatherTypeId
    ? result.delta
    : null;
}

/** What the stats column's Abyssal row says closed: the session weather's name, else normal space. */
export function AbyssalWeatherMeta() {
  const { t } = useTranslation();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  return useWeatherName(weatherTypeId) ?? t('fittings.weather.none');
}

/**
 * The stats column's Abyssal section body, flat: the session weather, then a
 * run for the open fit in it. Writes the session weather, so the editor's
 * stats move with it. Mount it only while it is shown: mounting is what
 * starts working out the weather's delta on the fit.
 */
export function AbyssalRunPlanner({
  hullGroupId,
  compare,
  typeName,
}: {
  /** The open fit's hull's inventory group; undefined while the catalogue loads hides the hull rule. */
  hullGroupId: number | undefined;
  compare: WeatherCompare | null;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { tier, security, setTier, setSecurity } = useAbyssalRunPlan();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const setWeather = useAbyssalWeather((state) => state.setWeather);
  const weather = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  const delta = useRunDelta(compare, weather?.typeId ?? null);

  const hull = abyssalHullRule(hullGroupId);
  const activation = abyssalActivation(tier, security);
  const filamentId = weather ? abyssalFilamentTypeId(tier, weather.kind) : null;

  return (
    <div className="space-y-2">
      <StatFields>
        <AbyssalWeatherPicker field />
        <StatField label={t('fittings.abyssalRun.tier')}>
          <Select
            value={String(tier)}
            onValueChange={(value) => {
              const next = Number(value) as AbyssalTier;
              const nextLevels = abyssalTierLevels(next);
              setTier(next);
              // Off-tier strength: new tier's harsher one, kind kept.
              if (weather && !nextLevels.includes(weather.level))
                setWeather(abyssalWeatherOf(weather.kind, nextLevels[1]).typeId);
            }}
          >
            <SelectTrigger
              aria-label={t('fittings.abyssalRun.tier')}
              size="sm"
              className={STAT_FIELD_WIDTH}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABYSSAL_TIERS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t('fittings.abyssalRun.tierOption', {
                    tier: value,
                    name: t(`fittings.abyssalRun.tierName.${value}`),
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StatField>
        <StatField label={t('fittings.abyssalRun.security')}>
          <Select
            value={String(security)}
            onValueChange={(value) => setSecurity(Number(value) as AbyssalSecurity)}
          >
            <SelectTrigger
              aria-label={t('fittings.abyssalRun.security')}
              size="sm"
              className={STAT_FIELD_WIDTH}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABYSSAL_SECURITY_BANDS.map((band) => (
                <SelectItem key={band} value={String(band)}>
                  {band === 0
                    ? t('fittings.abyssalRun.securityBelow')
                    : t('fittings.abyssalRun.securityOption', { value: fixed1(band / 10) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StatField>
      </StatFields>

      <ul className="space-y-1 text-xs">
        {weather && <StrengthNote tier={tier} weather={weather} />}
        {hullGroupId !== undefined && (
          <li className={hull.eligible ? 'text-text' : 'text-warning'}>
            {t(`fittings.abyssalRun.hull.${hull.eligible ? hull.shipClass : hull.reason}`)}
            {hull.eligible && !hull.confirmed && (
              <span className="text-warning"> {t('fittings.abyssalRun.hull.unconfirmed')}</span>
            )}
          </li>
        )}
        <li className={activation === 'clear' ? 'text-text' : 'text-warning'}>
          {t(`fittings.abyssalRun.activation.${activation}`, { tier })}
        </li>
        <li className="text-text-dim">
          {t('fittings.abyssalRun.timer', {
            minutes: ABYSSAL_RUN_MINUTES,
            pockets: ABYSSAL_POCKETS,
            perPocket: fixed1(ABYSSAL_RUN_MINUTES / ABYSSAL_POCKETS),
          })}
        </li>
        {filamentId !== null && hull.eligible && (
          <li>
            {t('fittings.abyssalRun.buy', { count: hull.ships })}{' '}
            <ItemInfoLink typeId={filamentId}>{typeName(filamentId)}</ItemInfoLink>
          </li>
        )}
      </ul>

      {weather === undefined ? (
        <StatNote>{t('fittings.abyssalRun.pickWeather')}</StatNote>
      ) : (
        <RunDeltaNote weather={weather} delta={delta} typeName={typeName} />
      )}
      <StatNote>{t('fittings.abyssalRun.source')}</StatNote>
    </div>
  );
}

/**
 * A filament fixes tier and kind; the site rolls the strength. An off-tier pick
 * keeps its filament and names the tiers that roll it; the stats stay at the pick.
 */
function StrengthNote({ tier, weather }: { tier: AbyssalTier; weather: AbyssalWeather }) {
  const { t } = useTranslation();
  const levels = abyssalTierLevels(tier);
  const range = {
    tier,
    low: abyssalWeatherOf(weather.kind, levels[0]).penaltyPercent,
    high: abyssalWeatherOf(weather.kind, levels[1]).penaltyPercent,
  };
  if (levels.includes(weather.level))
    return <li className="text-text-dim">{t('fittings.abyssalRun.strengthNote', range)}</li>;
  const rolling = abyssalTiersRolling(weather.level);
  return (
    <li className="text-warning">
      {t('fittings.abyssalRun.strengthOff', {
        ...range,
        picked: weather.penaltyPercent,
        from: rolling[0],
        to: rolling[rolling.length - 1],
      })}
    </li>
  );
}

function RunDeltaNote({
  weather,
  delta,
  typeName,
}: {
  weather: AbyssalWeather;
  delta: RunDelta | 'failed' | null;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  if (delta === null) return <StatNote>{t('fittings.abyssalRun.working')}</StatNote>;
  if (delta === 'failed')
    return <StatNote tone="warning">{t('fittings.abyssalRun.failed')}</StatNote>;
  const { changes, reach } = delta;
  return (
    <div className="text-xs">
      <div className="text-text-dim">
        {t('fittings.abyssalRun.deltaHeading', { weather: abyssalWeatherLabel(t, weather) })}
      </div>
      {changes.length === 0 && !reach ? (
        <div>{t('fittings.variations.noChanges')}</div>
      ) : (
        <ul className="space-y-0.5 tabular-nums">
          {changes.map((change) => (
            <li key={change.key}>{changeLabel(change, t)}</li>
          ))}
          {reach && (
            <li>
              {t('fittings.abyssalRun.range', {
                weapon: typeName(reach.typeId),
                before: kmValue(reach.before.optimal),
                after: kmValue(reach.after.optimal),
                // Optimal plus falloff, as the stats column and the HUD read it.
                fallBefore: kmValue(reach.before.optimal + reach.before.falloff),
                fallAfter: kmValue(reach.after.optimal + reach.after.falloff),
              })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
