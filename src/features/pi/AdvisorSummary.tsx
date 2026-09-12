/**
 * The tab's two questions, answered beside the inputs that set the answers.
 *
 * "What is not working" and "how do I earn more" are what the Advisor is for,
 * and a page that opens on a table of steps answers the second implicitly and
 * the first not at all. These two cards state both, the worklist below them is
 * the detail, and the third column is what the pilot told us — see
 * `HowYouPlay.tsx` for why the inputs sit in this row rather than in a
 * settings panel above it.
 *
 * ## The two figures are never one bar
 *
 * Tuning gains add to what the colonies earn now, so the bar carries exactly
 * those two and reads as a whole. A rebuild is what a planet would earn
 * *instead*; an earlier draft drew all three as one stacked bar, which claims
 * they sum. The rebuild figure sits below a rule, in quieter type, with a
 * sentence saying it is an alternative.
 *
 * ## A fault is not an opportunity
 *
 * The first card counts what is *wrong* — facilities nothing feeds, colonies
 * that fill before the pilot returns — and names each one in a chip. It used
 * to count the whole worklist, which folded in every `add` and `swap`: those
 * earn more, but nothing about them is broken. The steps that merely earn are
 * counted separately, in a quieter line.
 *
 * ## A partial total says so
 *
 * `totalColonyEarnings` counts the colonies it could not price rather than
 * folding them in as zero, and this renders that count. A sum presented as the
 * whole operation's earnings when a quarter of it could not be measured is the
 * failure the engine layer refuses; it would be undone here by not saying so.
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatIsk } from '@/lib/isk';
import type { BlindSpot } from './blindSpotModel';
import type { TotalColonyEarnings } from './colonyEarningsModel';
import type { Worklist } from './worklistModel';

export interface AdvisorSummaryProps {
  list: Worklist;
  earnings: TotalColonyEarnings;
  /** Read only for the colonies that could not be measured at all. */
  spots: readonly BlindSpot[];
  /** The third column: the inputs every figure here is derived from. */
  controls: React.ReactNode;
}

/** Hours under two days read as hours; beyond that a day count is what a pilot plans in. */
function span(hours: number, t: TFunction): string {
  return hours < 48
    ? t('piAdvisor.hoursShort', { count: Math.round(hours) })
    : t('piAdvisor.daysShort', { count: Math.round(hours / 24) });
}

function Card({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xs border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel-2 px-3.5 py-2">
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {title}
        </span>
        {meta}
      </div>
      <div className="flex flex-1 flex-col px-3.5 py-3">{children}</div>
    </div>
  );
}

function Chip({ tone, children }: { tone: 'warn' | 'quiet'; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-xs px-1.5 py-[3px] text-[0.6875rem] ${
        tone === 'warn'
          ? 'border border-warning/35 bg-warning/8 text-warning'
          : 'border border-line-bright text-text-dim'
      }`}
    >
      {children}
    </span>
  );
}

export function AdvisorSummary({ list, earnings, spots, controls }: AdvisorSummaryProps) {
  const { t } = useTranslation();
  const { tuning, rebuilds } = list;

  // `remove` and `haul` are faults: something is running that nothing feeds,
  // or the colony has stopped because it filled up. `add` and `swap` are
  // opportunities — worth doing, but not wrong.
  const faults = tuning.filter((row) => row.verb === 'remove' || row.verb === 'haul');
  const gains = tuning.length - faults.length;
  const faultPlanets = new Set(faults.map((row) => row.planetId)).size;
  const tuningIsk = tuning.reduce((sum, row) => sum + (row.iskPerHour ?? 0), 0);
  const rebuildIsk = rebuilds.reduce((sum, row) => sum + (row.iskPerHour ?? 0), 0);
  const now = earnings.iskPerHour;

  // One chip per stalling colony, because "2 colonies" does not tell a pilot
  // which two. The removals collapse into a single count: a pilot pulling idle
  // facilities does it planet by planet off the worklist, and six chips saying
  // "1 idle facility" would bury the colonies that have actually stopped.
  const idlePins = faults
    .filter((row) => row.verb === 'remove')
    .reduce((sum, row) => sum + (row.pinCount ?? 0), 0);
  // Only the colonies with no measured rate at all. A missing price or an
  // uncosted link is a gap in one figure, not a colony the page cannot read.
  const unreadable = spots.filter(
    (spot) => spot.reason === 'no-measured-extraction' || spot.reason === 'detail-unavailable'
  );

  // Both segments of one bar, and only these two: what the colonies earn now
  // and what tuning adds to it.
  const total = (now ?? 0) + tuningIsk;
  const nowWidth = total > 0 ? ((now ?? 0) / total) * 100 : 0;

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_21.5rem]">
      <Card
        title={t('piAdvisor.summaryFaultsTitle')}
        meta={
          faults.length > 0 && (
            <span className="text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
              {t('piAdvisor.summaryFaultsHeader', { count: faults.length })}
            </span>
          )
        }
      >
        {faults.length === 0 ? (
          <p className="text-xs text-text-dim">{t('piAdvisor.summaryFaultsNone')}</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl leading-none font-semibold text-warning tabular-nums">
                {faultPlanets}
              </span>
              <span className="text-[0.8125rem] leading-snug text-text-dim">
                {t('piAdvisor.summaryFaultsColonies', { count: faultPlanets })}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {faults
                .filter((row) => row.verb === 'haul')
                .map((row) => (
                  <Chip key={row.key} tone="warn">
                    {t('piAdvisor.summaryChipHaul', {
                      name: row.planetName ?? t('pi.planetLabel', { id: row.planetId }),
                      full: row.window ? span(row.window.hoursToFull, t) : '',
                      window: row.window ? span(row.window.haulHours, t) : '',
                    })}
                  </Chip>
                ))}
              {idlePins > 0 && (
                <Chip tone="warn">{t('piAdvisor.summaryChipIdle', { count: idlePins })}</Chip>
              )}
              {unreadable.map((spot) => (
                <Chip key={spot.key} tone="quiet">
                  {t('piAdvisor.summaryChipUnread', {
                    name: spot.planetName ?? t('pi.planetLabel', { id: spot.planetId }),
                  })}
                </Chip>
              ))}
            </div>
          </>
        )}
        {gains > 0 && (
          <p className="mt-auto pt-3 text-[0.6875rem] text-text-dim">
            {t('piAdvisor.summaryGainsOnly', { count: gains })}
          </p>
        )}
      </Card>

      <Card title={t('piAdvisor.summaryEarnTitle')}>
        {/*
          The unit sits on the figure, not in the header. It used to be a
          header label with a sentence under the number explaining where the
          number came from — but the bar and legend directly below already say
          that, so the sentence was restating its own illustration.
        */}
        {tuningIsk > 0 ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl leading-none font-semibold text-isk-pos tabular-nums">
              +{formatIsk(tuningIsk)}
            </span>
            <span className="text-[0.8125rem] leading-snug text-text-dim">
              {t('piAdvisor.summaryEarnIskPerHour')}
            </span>
          </div>
        ) : (
          <p className="text-xs text-text-dim">{t('piAdvisor.summaryEarnTuningNone')}</p>
        )}

        {now === null ? (
          <p className="mt-2 text-[0.6875rem] text-text-dim">
            {t('piAdvisor.summaryEarnNowUnknown')}
          </p>
        ) : (
          <>
            <div className="mt-3 flex h-1.5 gap-[3px]">
              <span className="rounded-[1px] bg-accent-dim" style={{ width: `${nowWidth}%` }} />
              <span className="flex-1 rounded-[1px] bg-isk-pos" />
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[0.6875rem] text-text-faint">
              <span>
                <span className="text-accent-dim">■</span>{' '}
                {t('piAdvisor.summaryEarnBarNow', { isk: formatIsk(now) })}
              </span>
              <span>
                <span className="text-isk-pos">■</span>{' '}
                {t('piAdvisor.summaryEarnBarAfter', { isk: formatIsk(now + tuningIsk) })}
              </span>
            </div>
          </>
        )}

        {earnings.coloniesWithoutFigure > 0 && (
          <p className="mt-2 text-[0.6875rem] text-text-dim">
            {t('piAdvisor.summaryEarnPartial', {
              count: t('piAdvisor.summaryPlanets', { count: earnings.coloniesWithoutFigure }),
            })}
          </p>
        )}

        {rebuilds.length > 0 && (
          <div className="mt-auto border-t border-line pt-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-base leading-none font-semibold text-text-dim tabular-nums">
                +{formatIsk(rebuildIsk)}
              </span>
              <span className="text-xs text-text-dim">
                {t('piAdvisor.summaryEarnRebuildBody', {
                  count: t('piAdvisor.summaryPlanets', { count: rebuilds.length }),
                })}
              </span>
            </div>
            <p className="mt-1 text-[0.625rem] leading-relaxed text-text-faint">
              {t('piAdvisor.summaryEarnRebuildHint')}
            </p>
          </div>
        )}
      </Card>

      <div className="md:col-span-2 lg:col-span-1">{controls}</div>
    </div>
  );
}
