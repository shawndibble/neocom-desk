/**
 * The tab's two questions, answered before the list that acts on them.
 *
 * "What is not working" and "how do I earn more" are what the Advisor is for,
 * and a page that opens on a table of steps answers the second implicitly and
 * the first not at all. These two cards state both in one line each, and the
 * worklist below them is the detail.
 *
 * ## The two figures are never one bar
 *
 * Tuning gains add to what the colonies earn now. A rebuild is what a planet
 * would earn *instead*. An earlier draft drew all three as one stacked bar
 * with a three-part legend, which reads as "these make a whole" — so the bar
 * carries only what is genuinely cumulative, and the rebuild figure sits below
 * a rule with a sentence saying it is an alternative.
 *
 * ## A partial total says so
 *
 * `totalColonyEarnings` counts the colonies it could not price rather than
 * folding them in as zero, and this renders that count. A sum presented as the
 * whole operation's earnings when a quarter of it could not be measured is the
 * failure the engine layer refuses; it would be undone here by not saying so.
 */
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import type { TotalColonyEarnings } from './colonyEarningsModel';
import type { Worklist } from './worklistModel';

export interface AdvisorSummaryProps {
  list: Worklist;
  earnings: TotalColonyEarnings;
  /** How many planets the tuning steps are spread across. */
  planetCount: number;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xs border border-line bg-panel">
      <div className="border-b border-line bg-panel-2 px-3 py-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {title}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

export function AdvisorSummary({ list, earnings, planetCount }: AdvisorSummaryProps) {
  const { t } = useTranslation();
  const { tuning, rebuilds } = list;

  const tuningIsk = tuning.reduce((sum, row) => sum + (row.iskPerHour ?? 0), 0);
  const rebuildIsk = rebuilds.reduce((sum, row) => sum + (row.iskPerHour ?? 0), 0);
  const now = earnings.iskPerHour;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card title={t('piAdvisor.summaryFaultsTitle')}>
        {tuning.length === 0 ? (
          <p className="text-xs text-text-dim">{t('piAdvisor.summaryFaultsNone')}</p>
        ) : (
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl leading-none font-semibold text-warning tabular-nums">
              {tuning.length}
            </span>
            <span className="text-xs leading-snug text-text-dim">
              {t('piAdvisor.summaryFaultsBody', {
                count: tuning.length,
                planets: t('piAdvisor.summaryPlanets', { count: planetCount }),
              })}
            </span>
          </div>
        )}
      </Card>

      <Card title={t('piAdvisor.summaryEarnTitle')}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.6875rem] tracking-wide text-text-dim uppercase">
            {t('piAdvisor.summaryEarnNow')}
          </span>
          {now === null ? (
            <span className="text-[0.6875rem] text-text-dim">
              {t('piAdvisor.summaryEarnNowUnknown')}
            </span>
          ) : (
            <span className="text-base font-semibold tabular-nums">
              {formatIsk(now)}
              <span className="ml-1 text-[0.6875rem] font-normal text-text-dim">ISK/hr</span>
            </span>
          )}
        </div>

        <p className="text-xs text-isk-pos">
          {tuningIsk > 0
            ? t('piAdvisor.summaryEarnTuning', {
                isk: `+${formatIsk(tuningIsk)}`,
                steps: t('piAdvisor.summaryFaultsCount', { count: tuning.length }),
              })
            : t('piAdvisor.summaryEarnTuningNone')}
        </p>

        {earnings.coloniesWithoutFigure > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piAdvisor.summaryEarnPartial', {
              count: t('piAdvisor.summaryPlanets', { count: earnings.coloniesWithoutFigure }),
            })}
          </p>
        )}

        {rebuilds.length > 0 && (
          <div className="mt-auto border-t border-line pt-2">
            <p className="text-xs text-text-dim">
              {t('piAdvisor.summaryEarnRebuild', {
                isk: `+${formatIsk(rebuildIsk)}`,
                count: t('piAdvisor.summaryPlanets', { count: rebuilds.length }),
              })}
            </p>
            <p className="mt-1 text-[0.625rem] text-text-faint">
              {t('piAdvisor.summaryEarnRebuildHint')}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
