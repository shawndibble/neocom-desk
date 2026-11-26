import { useCallback } from 'react';
import { useAsyncLoad, useKeyedLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import {
  ABYSSAL_POCKETS,
  ABYSSAL_RUN_MINUTES,
  ABYSSAL_SECURITY_BANDS,
  ABYSSAL_TIERS,
  abyssalActivation,
  abyssalFilamentCost,
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
import type { FittingCargoItem, FittingStats } from '@/engine/fittings/types';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import { getTradeHub } from '@/market/hubs';
import { formatIsk } from '@/lib/isk';
import { abyssalWeatherLabel, useAbyssalWeather, useWeatherName } from './abyssalWeatherSelection';
import { abyssalVerdict } from './abyssalVerdict';
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

function useRunDelta(
  compare: WeatherCompare | null,
  weatherTypeId: number | null
): RunDelta | 'failed' | null {
  const load = useCallback(async (): Promise<RunDelta | null> => {
    if (compare === null || weatherTypeId === null) return null;
    const { before, after } = await compare(weatherTypeId);
    return {
      changes: diffFittingStats(before, after).changes,
      reach: weaponReachChange(before, after),
    };
  }, [compare, weatherTypeId]);
  const delta = useAsyncLoad(load);
  return delta.status === 'failed' ? 'failed' : (delta.data ?? null);
}

function useFilamentPrice(typeId: number | null, hubId: string): number | null {
  const hub = getTradeHub(hubId);
  const percent = usePricePercentFor('fittings');
  const load = useCallback(async () => {
    if (!hub || typeId === null) return null;
    const prices = await getHubPricesAt(hub, [typeId], percent);
    return prices.get(typeId)?.sellMin ?? null;
  }, [hub, typeId, percent]);
  return (
    useKeyedLoad(typeId === null || !hub ? null : `${hubId}:${percent}:${typeId}`, load).data ??
    null
  );
}

export function AbyssalWeatherMeta() {
  const { t } = useTranslation();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  return useWeatherName(weatherTypeId) ?? t('fittings.weather.none');
}

export function AbyssalRunPlanner({
  hullGroupId,
  compare,
  cargo,
  typeName,
}: {
  hullGroupId: number | undefined;
  compare: WeatherCompare | null;
  cargo: readonly FittingCargoItem[];
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { hubId, hydrated: hubHydrated } = useHubFor('fittings');
  const { tier, security, setTier, setSecurity } = useAbyssalRunPlan();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const setWeather = useAbyssalWeather((state) => state.setWeather);
  const weather = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  const delta = useRunDelta(compare, weather?.typeId ?? null);

  const hull = abyssalHullRule(hullGroupId);
  const activation = abyssalActivation(tier, security);
  const filamentId = weather ? abyssalFilamentTypeId(tier, weather.kind) : null;
  const hubPrice = useFilamentPrice(
    filamentId !== null && hull.eligible && hubHydrated ? filamentId : null,
    hubId
  );
  const cost =
    filamentId !== null && hull.eligible
      ? abyssalFilamentCost(hull.ships, filamentId, hubPrice, cargo)
      : null;
  const hubName = getTradeHub(hubId)?.systemName ?? hubId;

  const reference = (
    <InfoTooltip
      label={t('fittings.abyssalRun.info')}
      glyph="info"
      content={
        <span className="block space-y-1">
          {weather && abyssalTierLevels(tier).includes(weather.level) && (
            <span className="block">{strengthRange(t, tier, weather)}</span>
          )}
          <span className="block">
            {t('fittings.abyssalRun.timer', {
              minutes: ABYSSAL_RUN_MINUTES,
              pockets: ABYSSAL_POCKETS,
              perPocket: fixed1(ABYSSAL_RUN_MINUTES / ABYSSAL_POCKETS),
            })}
          </span>
          <span className="block">{t('fittings.abyssalRun.source')}</span>
        </span>
      }
    />
  );
  const picker = (
    <StatFields>
      <AbyssalWeatherPicker field info={reference} />
    </StatFields>
  );
  if (weather === undefined)
    return (
      <div className="space-y-2">
        {picker}
        <StatNote>{t('fittings.abyssalRun.pickWeather')}</StatNote>
      </div>
    );

  const verdict = abyssalVerdict(hull, activation, hullGroupId !== undefined);
  const verdictText = (key: string) => t(`fittings.abyssalRun.verdict.${key}`, { tier });
  return (
    <div className="space-y-2">
      {picker}
      <RunDeltaNote weather={weather} delta={delta} typeName={typeName} />
      <StatFields>
        <StatField label={t('fittings.abyssalRun.tier')}>
          <Select
            value={String(tier)}
            onValueChange={(value) => {
              const next = Number(value) as AbyssalTier;
              const nextLevels = abyssalTierLevels(next);
              setTier(next);
              if (!nextLevels.includes(weather.level))
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
        <StrengthOffNote tier={tier} weather={weather} />
        <li>
          {verdict.clear && <span>{verdictText('clear')} · </span>}
          {verdict.facts.map((key, index) => (
            <span key={key}>
              {index > 0 && ' · '}
              {verdictText(key)}
            </span>
          ))}
        </li>
        {verdict.problems.map((key) => (
          <li key={key} className="text-warning">
            {verdictText(key)}
          </li>
        ))}
        {filamentId !== null && hull.eligible && (
          <li className="tabular-nums">
            {t('fittings.abyssalRun.buy')}{' '}
            <ItemInfoLink typeId={filamentId}>{typeName(filamentId)}</ItemInfoLink>{' '}
            {buyDetail(t, cost, hull.ships, hubName)}
          </li>
        )}
      </ul>
      {hull.eligible && hull.shipClass !== 'cruiser' && (
        <StatNote>{t(`fittings.abyssalRun.fleetNote.${hull.shipClass}`)}</StatNote>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

function buyDetail(
  t: Translate,
  cost: ReturnType<typeof abyssalFilamentCost> | null,
  ships: number,
  hub: string
): string {
  if (cost === null) return t('fittings.abyssalRun.buyCount', { count: ships });
  if (cost.kind === 'covered')
    return `${t('fittings.abyssalRun.buyCount', { count: ships })} · ${t('fittings.abyssalRun.buyCovered')}`;
  const isk = formatIsk(cost.total);
  return cost.inCargo > 0
    ? `${t('fittings.abyssalRun.buyCountMore', { count: cost.count })} · ${t('fittings.abyssalRun.buyIskShort', { isk, hub, inCargo: cost.inCargo })}`
    : `${t('fittings.abyssalRun.buyCount', { count: cost.count })} · ${t('fittings.abyssalRun.buyIsk', { isk, hub })}`;
}

function tierRange(tier: AbyssalTier, weather: AbyssalWeather) {
  const levels = abyssalTierLevels(tier);
  return {
    tier,
    low: abyssalWeatherOf(weather.kind, levels[0]).penaltyPercent,
    high: abyssalWeatherOf(weather.kind, levels[1]).penaltyPercent,
  };
}

function strengthRange(t: Translate, tier: AbyssalTier, weather: AbyssalWeather): string {
  return t('fittings.abyssalRun.strengthNote', tierRange(tier, weather));
}

function StrengthOffNote({ tier, weather }: { tier: AbyssalTier; weather: AbyssalWeather }) {
  const { t } = useTranslation();
  const levels = abyssalTierLevels(tier);
  if (levels.includes(weather.level)) return null;
  const rolling = abyssalTiersRolling(weather.level);
  return (
    <li className="text-warning">
      {t('fittings.abyssalRun.strengthOff', {
        ...tierRange(tier, weather),
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
