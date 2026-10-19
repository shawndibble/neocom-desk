import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import { formatCount } from '@/lib/formatCount';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, IskAmount, Panel, SegmentedControl } from '@/components/ui';
import type { RebuildPreference } from '@/engine/pi/planAdvice';
import { cx } from '@/lib/cx';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { EstimateBadge } from '../DirectiveRow';
import type { PlanView } from '../planView';

const SM_UP = '(min-width: 40rem)';
const MD_UP = '(min-width: 48rem)';

// --- Your planets ----------------------------------------------------------------

function Hero({ value, caption }: { value: number; caption: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cx(
          'text-4xl leading-none font-semibold tabular-nums',
          value < 0 ? 'text-isk-neg' : 'text-isk-pos'
        )}
      >
        {value < 0 ? '−' : '+'}
        <IskAmount value={Math.abs(value)} decimals={0} />
      </span>
      <span className={cx(eyebrowClassName, 'max-w-72 leading-snug')}>{caption}</span>
    </div>
  );
}

/** One figure of the summary grid: a micro-label over a large value, no box (it cannot be clicked). */
function StatBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className={eyebrowClassName}>{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-text tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The plan in one glance: what the quick wins and a rebuild would add, the
 * before/after figures, and the "What matters more?" switch that reshapes the
 * rebuilds.
 */
export function PlanSummaryPanel({
  view,
  preference,
  onPreference,
  priceSource,
}: {
  view: PlanView;
  preference: RebuildPreference;
  onPreference: (value: RebuildPreference) => void;
  priceSource: string;
}) {
  const { t } = useTranslation();
  const mdUp = useMediaQuery(MD_UP);
  const smUp = useMediaQuery(SM_UP);
  const { headline, stats } = view;
  // Beside the title from `sm`; own row below that, where the header has no room
  // and the label would overlap the title.
  const mattersToggle = (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <span className={eyebrowClassName}>{t('piPlan.make.matters')}</span>
      <SegmentedControl<RebuildPreference>
        label={t('piPlan.make.matters')}
        size={mdUp ? 'sm' : 'md'}
        value={preference}
        onChange={onPreference}
        options={[
          { value: 'isk', label: t('piPlan.make.mostIsk') },
          { value: 'haul', label: t('piPlan.make.leastHauling') },
        ]}
      />
    </span>
  );
  return (
    <Panel
      title={t('piPlan.make.summaryTitle')}
      meta={
        <span className="flex items-center gap-1.5">
          <EstimateBadge />
          <InfoTooltip
            label={t('piPlan.make.basisLabel')}
            glyph="info"
            content={t('piPlan.make.basis', { source: priceSource })}
          />
        </span>
      }
      actions={smUp ? mattersToggle : undefined}
      padded={false}
    >
      <div className="space-y-3 pt-3">
        {!smUp && (
          <div className="px-3" data-testid="pi-matters-row">
            {mattersToggle}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3 px-3">
          {headline.quickWinPerDay > 0 || view.quickWins.length > 0 ? (
            <Hero
              value={headline.quickWinPerDay}
              caption={t('piPlan.make.heroQuickWins', { count: headline.quickWinMinutes })}
            />
          ) : (
            <p className="text-sm text-text-dim">{t('piPlan.make.noQuickWins')}</p>
          )}
          {headline.rebuildCount > 0 ? (
            <Hero
              value={headline.rebuildGainPerDay}
              caption={t(
                preference === 'haul' ? 'piPlan.make.heroRebuildHaul' : 'piPlan.make.heroRebuild',
                { count: headline.rebuildCount }
              )}
            />
          ) : null}
          {/* With no rebuild, the Rebuild panel says so. */}
        </div>
        <dl className="grid grid-cols-2 divide-line border-t border-line max-md:divide-y md:grid-cols-4 md:divide-x [&>div:nth-child(even)]:max-md:border-l [&>div:nth-child(even)]:max-md:border-line">
          <StatBlock
            label={t('piPlan.make.statNow')}
            value={stats.todayPerDay === null ? '—' : <PerDay value={stats.todayPerDay} />}
          />
          <StatBlock
            label={t('piPlan.make.statAfterQuick')}
            value={
              stats.afterQuickWinsPerDay === null ? (
                '—'
              ) : (
                <PerDay value={stats.afterQuickWinsPerDay} />
              )
            }
          />
          <StatBlock
            label={t('piPlan.make.statAfterRebuild')}
            value={
              stats.afterRebuildPerDay === null ? '—' : <PerDay value={stats.afterRebuildPerDay} />
            }
          />
          <StatBlock
            label={t('piPlan.make.statHaul')}
            value={
              stats.m3PerWeek === null
                ? '—'
                : t('piPlan.make.m3PerWeek', {
                    value: formatCount(stats.m3PerWeek),
                  })
            }
          />
        </dl>
      </div>
    </Panel>
  );
}

function PerDay({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <>
      <IskAmount value={value} decimals={0} />
      {t('piPlan.make.perDay')}
    </>
  );
}
