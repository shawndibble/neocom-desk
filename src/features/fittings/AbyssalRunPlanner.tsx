import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Disclosure,
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
  abyssalFilamentTypeId,
  abyssalHullRule,
  abyssalTierLevels,
  longestWeaponRange,
  type AbyssalSecurity,
  type AbyssalTier,
} from '@/engine/fittings/abyssalRun';
import {
  ABYSSAL_WEATHER,
  abyssalWeatherById,
  type AbyssalWeatherKind,
} from '@/engine/fittings/abyssalWeather';
import { diffFittingStats, type StatChange } from '@/engine/fittings/variationDelta';
import type { FittingStats } from '@/engine/fittings/types';
import { useAbyssalWeather } from './abyssalWeatherSelection';
import { useAbyssalRunPlan } from './abyssalRunPlan';
import { changeLabel } from './fittingVariationsCsv';
import { StatField, StatFields, StatNote } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';

type Compare = (weatherTypeId: number) => Promise<{ before: FittingStats; after: FittingStats }>;

interface RunDelta {
  changes: StatChange[];
  range: {
    before: { optimal: number; falloff: number };
    after: { optimal: number; falloff: number };
  } | null;
}

/** What the weather does to the open fit, as the page's own stats would show it. */
function useRunDelta(compare: Compare | null, weatherTypeId: number | null): RunDelta | null {
  const [result, setResult] = useState<{ key: number; delta: RunDelta } | null>(null);
  useEffect(() => {
    if (compare === null || weatherTypeId === null) return;
    let cancelled = false;
    void compare(weatherTypeId)
      .then(({ before, after }) => {
        if (cancelled) return;
        const beforeRange = longestWeaponRange(before);
        const afterRange = longestWeaponRange(after);
        setResult({
          key: weatherTypeId,
          delta: {
            changes: diffFittingStats(before, after).changes,
            range:
              beforeRange && afterRange && beforeRange.optimal !== afterRange.optimal
                ? { before: beforeRange, after: afterRange }
                : null,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [compare, weatherTypeId]);
  return result !== null && result.key === weatherTypeId ? result.delta : null;
}

const km = (metres: number) => (metres / 1000).toFixed(1);

/**
 * "Plan an Abyssal run": pick a filament tier and a weather, and see what the
 * weather does to this fit, which filaments to buy, whether the hull may go in
 * and whether the system's security flags you. The weather is the session's
 * (`useAbyssalWeather`), so the editor's stats move with it.
 */
export function AbyssalRunPlanner({
  hullGroupId,
  compare,
  typeName,
}: {
  /** The open fit's hull's inventory group, undefined while the catalogue loads. */
  hullGroupId: number | undefined;
  compare: Compare | null;
  typeName: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { tier, security, setTier, setSecurity } = useAbyssalRunPlan();
  const weatherTypeId = useAbyssalWeather((state) => state.weatherTypeId);
  const setWeather = useAbyssalWeather((state) => state.setWeather);
  const weather = weatherTypeId === null ? undefined : abyssalWeatherById(weatherTypeId);
  const levels = abyssalTierLevels(tier);
  const delta = useRunDelta(expanded ? compare : null, weather?.typeId ?? null);

  const hull = abyssalHullRule(hullGroupId);
  const activation = abyssalActivation(tier, security);
  const filamentId = weather ? abyssalFilamentTypeId(tier, weather.kind) : null;

  return (
    <Disclosure
      label={t('fittings.abyssalRun.title')}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
    >
      <div className="space-y-2 pt-2">
        <StatFields>
          <StatField label={t('fittings.abyssalRun.tier')}>
            <Select
              value={String(tier)}
              onValueChange={(value) => {
                const next = Number(value) as AbyssalTier;
                setTier(next);
                // Keep the weather, at the harsher strength the new tier can roll.
                if (weather && !abyssalTierLevels(next).includes(weather.level))
                  setWeather(pickId(weather.kind, abyssalTierLevels(next)[1]!));
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
                {ABYSSAL_TIERS.map(({ tier: value, name }) => (
                  <SelectItem key={value} value={String(value)}>
                    {t('fittings.abyssalRun.tierOption', { tier: value, name })}
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
                      : t('fittings.abyssalRun.securityOption', { value: (band / 10).toFixed(1) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StatField>
        </StatFields>

        <ul className="space-y-1 text-xs">
          {weather && (
            <li className={levels.includes(weather.level) ? 'text-text-dim' : 'text-warning'}>
              {levels.includes(weather.level)
                ? t('fittings.abyssalRun.strengthNote', {
                    tier,
                    low: penaltyOf(weather.kind, levels[0]),
                    high: penaltyOf(weather.kind, levels[1]),
                  })
                : t('fittings.abyssalRun.strengthOff', { tier })}
            </li>
          )}
          <li className={hull.eligible ? 'text-text' : 'text-warning'}>
            {hull.eligible
              ? t(`fittings.abyssalRun.hull.${hull.shipClass}`, { count: hull.ships })
              : t(`fittings.abyssalRun.hull.${hull.reason}`)}
          </li>
          <li className={activation === 'clear' ? 'text-text' : 'text-warning'}>
            {t(`fittings.abyssalRun.activation.${activation}`, { tier })}
          </li>
          <li className="text-text-dim">
            {t('fittings.abyssalRun.timer', {
              minutes: ABYSSAL_RUN_MINUTES,
              pockets: ABYSSAL_POCKETS,
              perPocket: (ABYSSAL_RUN_MINUTES / ABYSSAL_POCKETS).toFixed(1),
            })}
          </li>
          {filamentId !== null && (
            <li>
              {t('fittings.abyssalRun.buy', { count: hull.eligible ? hull.ships : 1 })}{' '}
              <ItemInfoLink typeId={filamentId}>{typeName(filamentId)}</ItemInfoLink>
            </li>
          )}
        </ul>

        {weather === undefined ? (
          <StatNote>{t('fittings.abyssalRun.pickWeather')}</StatNote>
        ) : delta === null ? (
          <StatNote>{t('fittings.abyssalRun.working')}</StatNote>
        ) : (
          <div className="text-xs">
            <div className="text-text-dim">
              {t('fittings.abyssalRun.deltaHeading', {
                weather: t(`fittings.weather.kind.${weather.kind}`),
                level: weather.level,
              })}
            </div>
            {delta.changes.length === 0 && !delta.range ? (
              <div>{t('fittings.variations.noChanges')}</div>
            ) : (
              <ul className="space-y-0.5 tabular-nums">
                {delta.changes.map((change) => (
                  <li key={change.key}>{changeLabel(change, t)}</li>
                ))}
                {delta.range && (
                  <li>
                    {t('fittings.abyssalRun.range', {
                      before: km(delta.range.before.optimal),
                      after: km(delta.range.after.optimal),
                      fallBefore: km(delta.range.before.falloff),
                      fallAfter: km(delta.range.after.falloff),
                    })}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        <StatNote>{t('fittings.abyssalRun.source')}</StatNote>
      </div>
    </Disclosure>
  );
}

function penaltyOf(kind: AbyssalWeatherKind, level: 1 | 2 | 3): number {
  return ABYSSAL_WEATHER.find((w) => w.kind === kind && w.level === level)!.penaltyPercent;
}

function pickId(kind: AbyssalWeatherKind, level: 1 | 2 | 3): number {
  return ABYSSAL_WEATHER.find((w) => w.kind === kind && w.level === level)!.typeId;
}
