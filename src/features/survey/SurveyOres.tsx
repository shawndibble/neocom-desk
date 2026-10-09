/**
 * What is left of each ore: its rocks, volume, ISK and the percent of it still
 * there, as a bar. The bar's colour is how rich the ore is, ISK per m³ left,
 * on a gray, blue, yellow, orange ramp (`engine/survey/valueTier.ts`), so a
 * pilot sees which rocks are worth the trip without reading the numbers.
 */
import { Trans, useTranslation } from 'react-i18next';
import { IskAmount, Panel } from '@/components/ui';
import type { SurveySummary } from '@/engine/survey/series';
import { oreValueTiers } from '@/engine/survey/valueTier';
import { formatCompactNumber } from '@/lib/compactNumber';
import { VALUE_TIER_COLORS, VALUE_TIER_ORDER } from './surveyTones';

export function SurveyOres({ summary }: { summary: SurveySummary }) {
  const { t } = useTranslation();
  const tiers = oreValueTiers(summary.ores);
  const hasIsk = summary.iskLeft !== null;
  return (
    <Panel title={t('survey.oresTitle')}>
      <div className="space-y-4">
        <ul className="space-y-3">
          {summary.ores.map((ore) => {
            const leftPercent =
              ore.startVolume > 0 ? Math.round((ore.volume / ore.startVolume) * 100) : 0;
            return (
              <li key={ore.ore} className="space-y-1">
                <div className="flex flex-col gap-0.5 text-sm sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
                  <span>{ore.ore}</span>
                  <span className="text-text-dim tabular-nums">
                    {hasIsk ? (
                      <Trans
                        i18nKey="survey.oreRowIsk"
                        values={{
                          rocks: t('survey.oreRocks', { count: ore.rocks }),
                          volume: formatCompactNumber(ore.volume),
                          percent: leftPercent,
                        }}
                        components={{ isk: <IskAmount value={ore.isk} decimals={0} /> }}
                      />
                    ) : (
                      t('survey.oreRow', {
                        rocks: t('survey.oreRocks', { count: ore.rocks }),
                        volume: formatCompactNumber(ore.volume),
                        percent: leftPercent,
                      })
                    )}
                    {hasIsk && (
                      <span className="sr-only">
                        {' · '}
                        {t(`survey.tier.${tiers.get(ore.ore) ?? 'gray'}`)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-xs bg-line" aria-hidden="true">
                  <div
                    data-value-tier={tiers.get(ore.ore) ?? 'gray'}
                    className="h-full rounded-xs"
                    style={{
                      width: `${leftPercent}%`,
                      background: VALUE_TIER_COLORS[tiers.get(ore.ore) ?? 'gray'],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {hasIsk && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-dim">
            <span>{t('survey.valueRamp')}</span>
            <span className="flex items-center gap-1" aria-hidden="true">
              {t('survey.valueLow')}
              {VALUE_TIER_ORDER.map((tier) => (
                <span
                  key={tier}
                  className="h-2 w-5 rounded-xs"
                  style={{ background: VALUE_TIER_COLORS[tier] }}
                />
              ))}
              {t('survey.valueHigh')}
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
