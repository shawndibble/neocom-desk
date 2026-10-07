/**
 * Is it worth it: the **Lift** over the **Baseline** (never a gross margin),
 * whether every goal is met, and the caveats behind the numbers.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  DataAgeBadge,
  EmptyState,
  IskAmount,
  InfoTooltip,
  Panel,
  StatChip,
  StatChips,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PiData } from '@/sde/types';
import type { BestPlan } from '@/engine/pi/planBest';
import { clampIskZero, formatIskCompact } from '@/lib/isk';
import { EstimateBadge } from '../DirectiveRow';
import type { PlanVerdict } from '../goalPlannerModel';
import { ASSUMED_UNKNOWN_CUSTOMS } from '../colonyCustoms';
import { customsRatePercent } from '../customsRate';
import type { TotalColonyEarnings } from '../colonyEarningsModel';
import { commodityName } from '../goalPlannerFormat';
import type { GoalAttainment, PlanCaveats } from '../goalPlanView';
import { HOURS_PER_DAY, PERCENT_FORMAT, namesList, signedCompact, type PlanNames } from './format';

/** A signed ISK/day figure. Zero is neutral: the sign is the whole point of a Lift. */
function SignedIsk({ perHour }: { perHour: number }) {
  const perDay = perHour * HOURS_PER_DAY;
  const rounded = clampIskZero(perDay, 0);
  const tone = rounded > 0 ? 'text-isk-pos' : rounded < 0 ? 'text-isk-neg' : 'text-text';
  return (
    <span className={tone}>
      {rounded > 0 ? '+' : ''}
      <IskAmount value={rounded} revealOn="tap" decimals={0} />
    </span>
  );
}

function PerDayIsk({ perHour }: { perHour: number }) {
  return <IskAmount value={perHour * HOURS_PER_DAY} revealOn="tap" decimals={0} />;
}

export interface HeadlineProps {
  best: BestPlan;
  earnings: TotalColonyEarnings & { leftOut: number[] };
  verdict: PlanVerdict | null;
  attainment: GoalAttainment;
  caveats: PlanCaveats;
  hasGoals: boolean;
  pricesFetchedAt: Date;
  /** Jumps between colonies and to the hub are still being counted. */
  distancesPending: boolean;
  names: PlanNames;
}

function liftSentence(verdict: PlanVerdict, lift: string, t: TFunction): string {
  switch (verdict.lift) {
    case 'more':
      return t('piPlan.verdictMore', { isk: lift });
    case 'less':
      return t('piPlan.verdictLess', { isk: lift });
    case 'same':
      return t('piPlan.verdictSame');
  }
}

/** The hauling half of the verdict: effort (m3 x jumps) against the Baseline. */
function haulSentence(verdict: PlanVerdict, pending: boolean, t: TFunction): string | null {
  if (pending) return t('piPlan.verdictHaulPending');
  if (verdict.distances === 'unknown') return t('piPlan.verdictHaulUnknown');
  const change = verdict.haulChange;
  if (change === null) return null;
  const percent = Math.round(change * 100);
  if (percent < 0) return t('piPlan.verdictHaulLower', { percent: -percent });
  if (percent > 0) return t('piPlan.verdictHaulHigher', { percent });
  return t('piPlan.verdictHaulSame');
}

function verdictText(verdict: PlanVerdict, lift: string, pending: boolean, t: TFunction): string {
  return [liftSentence(verdict, lift, t), haulSentence(verdict, pending, t)]
    .filter(Boolean)
    .join(' ');
}

function attainmentText(attainment: GoalAttainment, pi: PiData, t: TFunction): string {
  return t('piPlan.attainment', {
    met: attainment.met,
    total: attainment.total,
    goals: attainment.unmet
      .map((goal) =>
        t('piPlan.shortAchievedGoal', {
          name: commodityName(goal.typeId, pi),
          percent: PERCENT_FORMAT.format(goal.fraction * 100),
        })
      )
      .join(', '),
  });
}

/**
 * The verdict, announced politely once the inputs settle — half a second
 * after the last recompute, so typing a rate does not read out every digit.
 */
function LiveVerdict({ text, pending }: { text: string; pending: boolean }) {
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    // Wait for distances so the verdict is said once, but not forever: if
    // they never land, say what there is after five seconds.
    const timer = setTimeout(() => setAnnounced(text), pending ? 5_000 : 500);
    return () => clearTimeout(timer);
  }, [text, pending]);
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {announced}
    </span>
  );
}

export function Headline({
  best,
  earnings,
  verdict,
  attainment,
  caveats,
  hasGoals,
  pricesFetchedAt,
  distancesPending,
  names,
}: HeadlineProps) {
  const { t } = useTranslation();
  const { economics } = best;
  const { pi, hub } = names;
  const badge = <DataAgeBadge date={pricesFetchedAt} />;

  if (economics.status === 'needs-price') {
    return (
      <Panel title={t('piPlan.headlineTitle')} actions={badge}>
        <EmptyState
          title={t('piPlan.unpricedTitle')}
          hint={t('piPlan.unpricedHint', {
            hub: hub.systemName,
            names: namesList(economics.missing, pi),
          })}
        />
      </Panel>
    );
  }

  const short = hasGoals && attainment.unmet.length > 0;
  // Rates and customs only matter to a plan with goals; a price read off the
  // ask flatters the Baseline as much as the plan, so it is said either way.
  const caveatLines = [
    hasGoals && caveats.estimatedRates.length > 0
      ? t('piPlan.caveatRates', { names: caveats.estimatedRates.map(names.planet).join(', ') })
      : null,
    hasGoals && caveats.assumedCustoms.length > 0
      ? t('piPlan.caveatCustoms', {
          names: caveats.assumedCustoms.map(names.planet).join(', '),
          percent: customsRatePercent(ASSUMED_UNKNOWN_CUSTOMS),
        })
      : null,
    caveats.valuedAtAsk.length > 0
      ? t('piPlan.caveatAskPriced', {
          hub: hub.systemName,
          names: namesList(caveats.valuedAtAsk, pi),
        })
      : null,
  ].filter((line): line is string => line !== null);
  const liftPerDay = economics.liftPerHour * HOURS_PER_DAY;
  const verdictLine = verdict
    ? verdictText(
        verdict,
        formatIskCompact(Math.abs(clampIskZero(liftPerDay, 0))),
        distancesPending,
        t
      )
    : null;
  const customsPerHour =
    economics.customs.exportFromExtractors +
    economics.customs.importToHost +
    economics.customs.exportFromHost;
  const switchGain =
    earnings.iskPerHour !== null
      ? (economics.baselinePerHour - earnings.iskPerHour) * HOURS_PER_DAY
      : null;
  const announcement = [short ? attainmentText(attainment, pi, t) : null, verdictLine]
    .filter(Boolean)
    .join(' ');

  const chips = (
    <StatChips>
      {hasGoals && (
        <StatChip
          label={t('piPlan.netPerDay')}
          value={<PerDayIsk perHour={economics.netPerHour} />}
        />
      )}
      <StatChip
        label={t('piPlan.baselinePerDay')}
        value={<PerDayIsk perHour={economics.baselinePerHour} />}
        tooltip={t('piPlan.baselineTooltip')}
      />
      {earnings.iskPerHour !== null && (
        <StatChip
          label={t('piPlan.earnsNowPerDay')}
          value={<PerDayIsk perHour={earnings.iskPerHour} />}
          tooltip={t('piPlan.earnsNowTooltip')}
        />
      )}
      {hasGoals && (
        <>
          <StatChip label={t('piPlan.buysPerDay')} value={<PerDayIsk perHour={economics.buys} />} />
          <StatChip
            label={t('piPlan.customsPerDay')}
            value={<PerDayIsk perHour={customsPerHour} />}
          />
        </>
      )}
    </StatChips>
  );

  return (
    <Panel title={t('piPlan.headlineTitle')} actions={badge}>
      <LiveVerdict text={announcement} pending={distancesPending} />
      <div className="space-y-3" data-testid="goal-plan-headline">
        {hasGoals ? (
          <>
            {short && (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-warning">
                <Icon.Warn
                  aria-hidden="true"
                  size={Icon.ICON_SIZE.md}
                  className="mt-0.5 shrink-0"
                />
                {attainmentText(attainment, pi, t)}
              </p>
            )}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl leading-none font-semibold tabular-nums">
                <SignedIsk perHour={economics.liftPerHour} />
              </span>
              <span className="text-xs text-text-dim">
                {t('piPlan.liftLabel')}{' '}
                <InfoTooltip
                  label={t('common.aboutLabel', { label: t('piPlan.liftLabel') })}
                  content={t('piPlan.liftTooltip')}
                />
              </span>
              {short && (
                <span className="rounded-xs border border-warning/60 px-1.5 text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                  {t('piPlan.liftMetOnly')}
                </span>
              )}
            </div>
            {verdictLine && <p className="text-sm text-text">{verdictLine}</p>}
          </>
        ) : (
          <p className="text-sm text-text">{t('piPlan.noGoalsPrompt')}</p>
        )}
        {chips}
        {switchGain !== null && Math.abs(switchGain) >= 1 && (
          <p className="text-xs text-text">
            {t('piPlan.switchGain', { isk: signedCompact(switchGain) })}
          </p>
        )}
        {earnings.leftOut.length > 0 && (
          <p className="text-[0.6875rem] text-text-dim">
            {t('piPlan.earnsNowLeftOut', {
              count: earnings.leftOut.length,
              names: earnings.leftOut.map(names.planet).join(', '),
            })}
          </p>
        )}
        {caveatLines.length > 0 && (
          <p className="flex items-start gap-1.5 text-[0.6875rem] text-text-dim">
            <EstimateBadge />
            <span>{caveatLines.join(' ')}</span>
          </p>
        )}
      </div>
    </Panel>
  );
}
