/**
 * The Goal Planner's answer, in the order a pilot reads it: is it worth it
 * (Headline — the **Lift** over the **Baseline**, never a gross margin), what
 * stops it (Shortfalls), what to set up (Changes), whether it fits (Colony
 * fit), what it costs to move (Hauling), and the whole demand (Flow).
 *
 * Every section is fed a computed answer; nothing here prices or plans.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  IskAmount,
  InfoTooltip,
  Panel,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import * as Icon from '@/components/ui/icons';
import type { PiData, PiFactoryKind } from '@/sde/types';
import type {
  ColonyAssignment,
  DemandLine,
  DemandSource,
  ExtractionSlot,
  FitLimit,
  FlowEnd,
  RateSource,
  Shortfall,
} from '@/engine/pi/goalTypes';
import type { BestPlan } from '@/engine/pi/planBest';
import type { TradeHub } from '@/market/hubs';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { JumpsLink } from '@/features/travel/JumpsLink';
import { formatVolume } from '@/features/industry/format';
import { clampIskZero, formatIskCompact } from '@/lib/isk';
import {
  DirectiveRow,
  EstimateBadge,
  LoadMeter,
  TierChip,
  type DirectiveVerb,
} from './DirectiveRow';
import type { PlanHauling, PlanVerdict, PlannerColonyRow } from './goalPlannerModel';
import type { TotalColonyEarnings } from './colonyEarningsModel';
import { commodityName, formatUnits } from './goalPlannerFormat';
import type {
  ColonyStep,
  GoalAttainment,
  PlanCaveats,
  ShortfallHint,
  StepKind,
} from './goalPlanView';

const HOURS_PER_DAY = 24;
const PERCENT_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Names and links the sections share. */
export interface PlanNames {
  planet: (planetId: number) => string;
  systemOf: (planetId: number) => number | undefined;
  hub: TradeHub;
  pi: PiData;
}

function namesList(typeIds: readonly number[], pi: PiData): string {
  return typeIds.map((id) => commodityName(id, pi)).join(', ');
}

function colonyHref(planetId: number): string {
  return `/planetary-industry/colonies?colony=${planetId}`;
}

function advisorHref(systemId: number | undefined): string {
  return systemId === undefined
    ? '/planetary-industry/advisor'
    : `/planetary-industry/advisor?system=${systemId}`;
}

function ColonyLink({ planetId, names }: { planetId: number; names: PlanNames }) {
  return (
    <Link className={inlineLinkClassName} to={colonyHref(planetId)}>
      {names.planet(planetId)}
    </Link>
  );
}

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

function signedCompact(perDay: number): string {
  const rounded = clampIskZero(perDay, 0);
  return `${rounded > 0 ? '+' : ''}${formatIskCompact(rounded)}`;
}

function facilityName(kind: PiFactoryKind, t: TFunction): string {
  switch (kind) {
    case 'basic':
      return t('piAdvisor.pinKind.basic');
    case 'advanced':
      return t('piAdvisor.pinKind.advanced');
    case 'highTech':
      return t('piAdvisor.pinKind.highTech');
  }
}

function limitsText(limits: readonly FitLimit[], t: TFunction): string {
  return limits
    .map((limit) => (limit === 'cpu' ? t('piPlan.cpu') : t('piPlan.powergrid')))
    .join(', ');
}

function destinationName(to: FlowEnd, names: PlanNames): string {
  return to === 'hub' ? names.hub.systemName : names.planet(to);
}

// --- Headline ------------------------------------------------------------

export interface HeadlineProps {
  best: BestPlan;
  earnings: TotalColonyEarnings & { leftOut: number[] };
  verdict: PlanVerdict | null;
  attainment: GoalAttainment;
  caveats: PlanCaveats;
  hasGoals: boolean;
  pricesFetchedAt: Date;
  names: PlanNames;
}

function verdictText(verdict: PlanVerdict, lift: string, t: TFunction): string {
  const haul = verdict.haulChange;
  const percent = haul === null ? '' : PERCENT_FORMAT.format(Math.abs(haul) * 100);
  const lessHaul = haul !== null && Math.round(haul * 100) < 0;
  switch (verdict.lift) {
    case 'more':
      return lessHaul
        ? t('piPlan.verdictMoreHaulsLess', { isk: lift, percent })
        : t('piPlan.verdictMore', { isk: lift });
    case 'less':
      return lessHaul
        ? t('piPlan.verdictLessHaulsLess', { isk: lift, percent })
        : t('piPlan.verdictLess', { isk: lift });
    case 'same':
      return t('piPlan.verdictSame');
  }
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
function LiveVerdict({ text }: { text: string }) {
  const [announced, setAnnounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(text), 500);
    return () => clearTimeout(timer);
  }, [text]);
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
  const liftPerDay = economics.liftPerHour * HOURS_PER_DAY;
  const verdictLine = verdict
    ? verdictText(verdict, formatIskCompact(Math.abs(clampIskZero(liftPerDay, 0))), t)
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
      <LiveVerdict text={announcement} />
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
        {hasGoals && (caveats.estimatedRates.length > 0 || caveats.assumedCustoms.length > 0) && (
          <p className="flex items-start gap-1.5 text-[0.6875rem] text-text-dim">
            <EstimateBadge />
            <span>
              {[
                caveats.estimatedRates.length > 0
                  ? t('piPlan.caveatRates', {
                      names: caveats.estimatedRates.map(names.planet).join(', '),
                    })
                  : null,
                caveats.assumedCustoms.length > 0
                  ? t('piPlan.caveatCustoms', {
                      names: caveats.assumedCustoms.map(names.planet).join(', '),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </span>
          </p>
        )}
      </div>
    </Panel>
  );
}

// --- Shortfalls ----------------------------------------------------------

function ColonyNames({ ids, names }: { ids: readonly number[]; names: PlanNames }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <ColonyLink planetId={id} names={names} />
        </span>
      ))}
    </>
  );
}

function shortfallText(
  shortfall: Shortfall,
  hint: ShortfallHint,
  names: PlanNames,
  advisorSystem: number | undefined,
  t: TFunction
): ReactNode {
  const { pi } = names;
  switch (shortfall.kind) {
    case 'type-gap':
      return (
        <>
          {t('piPlan.shortTypeGap', {
            types: shortfall.fixPlanetTypes
              .map((type) => t(`pi.planetType.${type}`))
              .join(t('piPlan.or')),
            p0: commodityName(shortfall.p0TypeId, pi),
            p1: commodityName(shortfall.p1TypeId, pi),
            p1Rate: formatUnits(Math.round(shortfall.p1UnitsPerHour)),
            p0Rate: formatUnits(Math.round(shortfall.unitsPerHour)),
          })}{' '}
          {hint?.kind === 'switched-off' ? (
            <>
              {t('piPlan.shortSwitchedOff')} <ColonyNames ids={hint.planetIds} names={names} />.
            </>
          ) : (
            <Link className={inlineLinkClassName} to={advisorHref(advisorSystem)}>
              {t('piPlan.openAdvisor')}
            </Link>
          )}
        </>
      );
    case 'budget-gap':
      return (
        <>
          {t('piPlan.shortBudgetGap', {
            p0: commodityName(shortfall.p0TypeId, pi),
            p1: commodityName(shortfall.p1TypeId, pi),
            p1Rate: formatUnits(Math.round(shortfall.p1UnitsPerHour)),
            p0Rate: formatUnits(Math.round(shortfall.unitsPerHour)),
          })}{' '}
          {hint?.kind === 'retarget' ? (
            <>
              {t('piPlan.shortRetarget', { p0: commodityName(shortfall.p0TypeId, pi) })}{' '}
              <ColonyNames ids={hint.planetIds} names={names} />.
            </>
          ) : (
            t('piPlan.shortBuy', { p1: commodityName(shortfall.p1TypeId, pi) })
          )}
        </>
      );
    case 'no-factory-host':
      return t('piPlan.shortNoHost', { facility: facilityName(shortfall.facility, t) });
    case 'host-over-budget':
      return (
        <>
          <ColonyLink planetId={shortfall.planetId} names={names} />{' '}
          {t('piPlan.shortHostOver', { limits: limitsText(shortfall.limitedBy, t) })}
        </>
      );
  }
}

export function Shortfalls({
  shortfalls,
  hints,
  names,
  advisorSystem,
}: {
  shortfalls: readonly Shortfall[];
  hints: readonly ShortfallHint[];
  names: PlanNames;
  advisorSystem: number | undefined;
}) {
  const { t } = useTranslation();
  if (shortfalls.length === 0) return null;
  return (
    <Panel title={t('piPlan.shortfallsTitle', { count: shortfalls.length })}>
      <ul className="space-y-2">
        {shortfalls.map((shortfall, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text">
            <Icon.Warn
              aria-hidden="true"
              size={Icon.ICON_SIZE.sm}
              className="mt-px shrink-0 text-warning"
            />
            <span>{shortfallText(shortfall, hints[i] ?? null, names, advisorSystem, t)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- Changes -------------------------------------------------------------

const STEP_VERB: Record<StepKind, DirectiveVerb> = {
  'as-is': 'asIs',
  start: 'start',
  add: 'add',
  stop: 'stop',
  retarget: 'swap',
  host: 'build',
  idle: 'asIs',
};

function stepHeadline(step: ColonyStep, pi: PiData, t: TFunction): string {
  switch (step.kind) {
    case 'as-is':
      return step.switchTo.length > 0
        ? t('piPlan.stepSwitch', { p1s: namesList(step.switchTo, pi) })
        : t('piPlan.stepAsIs');
    case 'start':
      return t('piPlan.stepStart');
    case 'add':
      return t('piPlan.stepAdd');
    case 'stop':
      return t('piPlan.stepStop', { p0s: namesList(step.stop, pi) });
    case 'retarget':
      return t('piPlan.stepRetarget', { p0s: namesList(step.stop, pi) });
    case 'host':
      return t('piPlan.stepHost');
    case 'idle':
      return t('piPlan.stepIdle');
  }
}

function StepDetail({ step, names }: { step: ColonyStep; names: PlanNames }) {
  const { t } = useTranslation();
  const { pi } = names;
  const lines: string[] = [];
  if (step.kind !== 'as-is' && step.kind !== 'idle') {
    for (const slot of step.extract) {
      lines.push(
        t('piPlan.stepExtract', {
          count: slot.ecus,
          p0: commodityName(slot.p0TypeId, pi),
          basics: slot.basicFactories,
          p1: commodityName(slot.p1TypeId, pi),
        })
      );
    }
    for (const factory of step.factories) {
      lines.push(
        t('piPlan.stepFactory', {
          count: factory.count,
          product: commodityName(factory.typeId, pi),
        })
      );
    }
  }
  for (const ship of step.ships) {
    lines.push(
      t('piPlan.stepShip', {
        item: commodityName(ship.typeId, pi),
        to: destinationName(ship.to, names),
      })
    );
  }
  if (lines.length === 0) return null;
  return (
    <ul className="col-span-full space-y-0.5 pl-1 text-[0.6875rem] text-text-dim">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export function Changes({ steps, names }: { steps: readonly ColonyStep[]; names: PlanNames }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  return (
    <Panel title={t('piPlan.changesTitle')}>
      <ul className="space-y-3">
        {steps.map((step) => (
          <li key={step.planetId}>
            <DirectiveRow
              verb={STEP_VERB[step.kind]}
              chips={<StepDetail step={step} names={names} />}
            >
              <ColonyLink planetId={step.planetId} names={names} />
              {' — '}
              {stepHeadline(step, names.pi, t)}
            </DirectiveRow>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// --- Colony fit ----------------------------------------------------------

function rateSourceText(source: RateSource, t: TFunction): string {
  switch (source) {
    case 'measured':
      return t('piPlan.rateMeasured');
    case 'own-mean':
      return t('piPlan.rateOwnMean');
    case 'assumed':
      return t('piPlan.rateAssumed');
  }
}

function roleText(role: ColonyAssignment['role'], t: TFunction): string {
  switch (role) {
    case 'extract':
      return t('piPlan.roleExtract');
    case 'factory':
      return t('piPlan.roleFactory');
    case 'baseline':
      return t('piPlan.roleBaseline');
    case 'idle':
      return t('piPlan.roleIdle');
  }
}

function SlotLine({ slot, pi }: { slot: ExtractionSlot; pi: PiData }) {
  const { t } = useTranslation();
  const p1 = commodityName(slot.p1TypeId, pi);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text">
      <span>
        {t('piPlan.slotLine', {
          p0: commodityName(slot.p0TypeId, pi),
          p1,
          count: slot.ecus,
          rate: formatUnits(Math.round(slot.p1PerHour)),
        })}
      </span>
      {slot.rateSource !== 'measured' && (
        <span className="inline-flex items-center gap-1">
          <EstimateBadge />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('piAdvisor.estimateBadge') })}
            content={rateSourceText(slot.rateSource, t)}
          />
        </span>
      )}
    </li>
  );
}

export function ColonyFit({
  assignments,
  rows,
  names,
}: {
  assignments: readonly ColonyAssignment[];
  rows: readonly PlannerColonyRow[];
  names: PlanNames;
}) {
  const { t } = useTranslation();
  const rowById = new Map(rows.map((row) => [row.planetId, row]));
  const shown = assignments.filter((assignment) => assignment.role !== 'idle');
  if (shown.length === 0) return null;
  return (
    <Panel title={t('piPlan.fitTitle')}>
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((assignment) => {
          const row = rowById.get(assignment.planetId);
          const heads = row?.colony?.headsPerExtractor ?? 0;
          return (
            <li
              key={assignment.planetId}
              className="space-y-2 rounded-xs border border-line bg-panel-2/40 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">
                  <ColonyLink planetId={assignment.planetId} names={names} />
                </span>
                <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {roleText(assignment.role, t)}
                </span>
              </div>
              {assignment.runningToday &&
              (assignment.used.cpu > assignment.budget.cpu ||
                assignment.used.powergrid > assignment.budget.powergrid) ? (
                <p className="flex items-center gap-1.5 text-xs text-text">
                  {t('piPlan.fitAsBuilt')}
                  <InfoTooltip
                    label={t('common.aboutLabel', { label: t('piPlan.fitAsBuilt') })}
                    content={t('piPlan.fitAsBuiltTooltip')}
                  />
                </p>
              ) : (
                <>
                  <LoadMeter
                    label={t('piPlan.cpu')}
                    used={assignment.used.cpu}
                    budget={assignment.budget.cpu}
                  />
                  <LoadMeter
                    label={t('piPlan.powergrid')}
                    used={assignment.used.powergrid}
                    budget={assignment.budget.powergrid}
                  />
                </>
              )}
              {assignment.limitedBy.length > 0 && (
                <p className="flex items-center gap-1 text-[0.6875rem] text-warning">
                  <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('piPlan.fitOver', { limits: limitsText(assignment.limitedBy, t) })}
                </p>
              )}
              {assignment.slots.length > 0 && (
                <ul className="space-y-1">
                  {assignment.slots.map((slot) => (
                    <SlotLine key={slot.p0TypeId} slot={slot} pi={names.pi} />
                  ))}
                </ul>
              )}
              {assignment.role === 'factory' && (
                <p className="text-xs text-text">
                  {(['basic', 'advanced', 'highTech'] as const)
                    .filter((kind) => (assignment.factories[kind] ?? 0) > 0)
                    .map((kind) =>
                      t('piPlan.pinCount', {
                        count: assignment.factories[kind],
                        pin: facilityName(kind, t),
                      })
                    )
                    .join(', ')}
                </p>
              )}
              {row && (row.headsAssumed || row.linkCostBorrowed) && (
                <p className="text-[0.6875rem] text-text-dim">
                  {[
                    row.headsAssumed ? t('piPlan.fitBorrowedHeads', { heads }) : null,
                    row.linkCostBorrowed ? t('piPlan.fitBorrowedLink') : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// --- Hauling -------------------------------------------------------------

interface HaulRow {
  planetId: number;
  name: string;
  outM3: number;
  inM3: number;
  /** Undefined while counting; null when no route. */
  jumps: number | null | undefined;
}

export function Hauling({
  hauling,
  jumpsByPlanet,
  haulDays,
  names,
}: {
  hauling: PlanHauling;
  jumpsByPlanet: ReadonlyMap<number, number | null>;
  haulDays: number;
  names: PlanNames;
}) {
  const { t } = useTranslation();
  const { hub } = names;
  const rows: HaulRow[] = useMemo(
    () =>
      [...hauling.perColony]
        .map(([planetId, m3]) => ({
          planetId,
          name: names.planet(planetId),
          ...m3,
          jumps: jumpsByPlanet.get(planetId),
        }))
        .sort((a, b) => b.outM3 + b.inM3 - (a.outM3 + a.inM3)),
    [hauling, jumpsByPlanet, names]
  );
  const change =
    hauling.baselineM3PerTrip > 0 ? hauling.planM3PerTrip / hauling.baselineM3PerTrip - 1 : null;
  const changePercent = change === null ? 0 : Math.round(change * 100);
  const jumpsHeader = t('piPlan.haulJumps', { hub: hub.systemName });
  const columns = useMemo<DataTableColumn<HaulRow>[]>(
    () => [
      {
        id: 'colony',
        header: t('piPlan.haulColony'),
        primary: true,
        sortValue: (row) => row.name,
        render: (row) => <ColonyLink planetId={row.planetId} names={names} />,
      },
      {
        id: 'out',
        header: t('piPlan.haulOut'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.outM3,
        render: (row) => formatVolume(row.outM3),
      },
      {
        id: 'in',
        header: t('piPlan.haulIn'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.inM3,
        render: (row) => formatVolume(row.inM3),
      },
      {
        id: 'jumps',
        header: jumpsHeader,
        align: 'right',
        className: 'tabular-nums',
        sortValue: (row) => row.jumps ?? undefined,
        render: (row) => {
          if (row.jumps === undefined) return <span className="text-text-dim">…</span>;
          if (row.jumps === null) {
            return (
              <span className="text-text-dim" title={t('jumpRange.distanceUnavailable')}>
                —
              </span>
            );
          }
          return (
            <JumpsLink systemId={hub.systemId} fromId={names.systemOf(row.planetId)}>
              {row.jumps}
            </JumpsLink>
          );
        },
      },
    ],
    [t, names, hub, jumpsHeader]
  );
  const tableExport = useTableExport({
    surface: 'pi-plan-hauling',
    rows,
    columns: [
      { header: t('piPlan.haulColony'), value: (row) => row.name },
      { header: t('piPlan.haulOutM3'), value: (row) => Math.round(row.outM3 * 10) / 10 },
      { header: t('piPlan.haulInM3'), value: (row) => Math.round(row.inM3 * 10) / 10 },
      { header: jumpsHeader, value: (row) => row.jumps ?? '' },
    ],
  });
  return (
    <Panel
      title={t('piPlan.haulTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('piPlan.haulPerTrip', { count: haulDays })}
        </span>
      }
      actions={
        rows.length > 0 ? (
          <TableActionsMenu name={t('piPlan.haulTitle')} tableExport={tableExport} />
        ) : undefined
      }
      padded={false}
    >
      <div className="p-3">
        <StatChips>
          <StatChip label={t('piPlan.haulPlanTotal')} value={formatVolume(hauling.planM3PerTrip)} />
          <StatChip
            label={t('piPlan.haulBaselineTotal')}
            value={formatVolume(hauling.baselineM3PerTrip)}
          />
          {change !== null && (
            <StatChip
              label={t('piPlan.haulChange')}
              tone={changePercent < 0 ? 'success' : 'default'}
              value={
                changePercent < 0
                  ? t('piPlan.haulLess', { percent: -changePercent })
                  : changePercent > 0
                    ? t('piPlan.haulMore', { percent: changePercent })
                    : t('piPlan.haulSame')
              }
            />
          )}
        </StatChips>
      </div>
      {rows.length > 0 && (
        <DataTable
          {...tableExport.tableProps}
          label={t('piPlan.haulTableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.planetId}
          density="compact"
          stackColumns={2}
        />
      )}
    </Panel>
  );
}

// --- Flow ----------------------------------------------------------------

/** Under this short of one, a made fraction is float dust. */
const WHOLE = 0.995;

/** The source, with how much is made where the line is partial. */
function sourceLabel(line: DemandLine, t: TFunction): string {
  const percent = PERCENT_FORMAT.format(line.madeFraction * 100);
  if (line.source === 'short' && line.madeFraction > 1 - WHOLE) {
    return t('piPlan.sourceShortPartial', { percent });
  }
  if ((line.source === 'made' || line.source === 'extracted') && line.madeFraction < WHOLE) {
    return t('piPlan.sourceHeldBack', { percent });
  }
  return sourceText(line.source, t);
}

function sourceText(source: DemandSource, t: TFunction): string {
  switch (source) {
    case 'made':
      return t('piPlan.sourceMade');
    case 'bought':
      return t('piPlan.sourceBought');
    case 'short':
      return t('piPlan.sourceShort');
    case 'extracted':
      return t('piPlan.sourceExtracted');
    case 'not-extracted':
      return t('piPlan.sourceNotExtracted');
    case 'blocked':
      return t('piPlan.sourceBlocked');
  }
}

const SOURCE_TONE: Record<DemandSource, string> = {
  made: 'text-text',
  extracted: 'text-text',
  'not-extracted': 'text-text-dim',
  bought: 'text-warning',
  short: 'text-danger',
  blocked: 'text-text-dim',
};

export function Flow({ demand, names }: { demand: readonly DemandLine[]; names: PlanNames }) {
  const { t } = useTranslation();
  const { pi, hub } = names;
  const columns = useMemo<DataTableColumn<DemandLine>[]>(
    () => [
      {
        id: 'item',
        header: t('piPlan.flowItem'),
        primary: true,
        sortValue: (line) => commodityName(line.typeId, pi),
        render: (line) => (
          <span className="inline-flex items-center gap-2">
            <TierChip tier={line.tier} />
            <MarketItemLink typeId={line.typeId} hubId={hub.id}>
              {commodityName(line.typeId, pi)}
            </MarketItemLink>
          </span>
        ),
      },
      {
        id: 'perDay',
        header: t('piPlan.flowPerDay'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.unitsPerHour,
        render: (line) => formatUnits(Math.round(line.unitsPerHour * HOURS_PER_DAY)),
      },
      {
        id: 'perHour',
        header: t('piPlan.flowPerHour'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.unitsPerHour,
        render: (line) => formatUnits(line.unitsPerHour),
      },
      {
        id: 'factories',
        header: t('piPlan.flowFactories'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.factories ?? -1,
        render: (line) => (line.factories === null ? '—' : String(line.factories)),
      },
      {
        id: 'source',
        header: t('piPlan.flowSource'),
        sortValue: (line) => line.source,
        render: (line) => {
          const heldBack =
            (line.source === 'made' || line.source === 'extracted') && line.madeFraction < WHOLE;
          return (
            <span
              className={heldBack ? 'text-warning' : SOURCE_TONE[line.source]}
              title={heldBack ? t('piPlan.sourceHeldBackTooltip') : undefined}
            >
              {sourceLabel(line, t)}
            </span>
          );
        },
      },
    ],
    [t, pi, hub]
  );
  const tableExport = useTableExport({
    surface: 'pi-plan-flow',
    rows: demand,
    columns: [
      { header: t('piPlan.flowTier'), value: (line) => `P${line.tier}` },
      { header: t('piPlan.flowItem'), value: (line) => commodityName(line.typeId, pi) },
      { header: t('piPlan.flowPerDay'), value: (line) => line.unitsPerHour * HOURS_PER_DAY },
      { header: t('piPlan.flowPerHour'), value: (line) => line.unitsPerHour },
      { header: t('piPlan.flowFactories'), value: (line) => line.factories ?? '' },
      { header: t('piPlan.flowSource'), value: (line) => sourceLabel(line, t) },
    ],
  });
  if (demand.length === 0) return null;
  return (
    <Panel
      title={t('piPlan.flowTitle')}
      actions={<TableActionsMenu name={t('piPlan.flowTitle')} tableExport={tableExport} />}
      padded={false}
    >
      <DataTable
        {...tableExport.tableProps}
        label={t('piPlan.flowTableLabel')}
        columns={columns}
        rows={demand}
        rowKey={(line) => `${line.typeId}:${line.source}`}
        density="compact"
        stackColumns={2}
        rowContextMenu={(line, tr) => (
          <ItemContextMenu typeId={line.typeId} itemName={commodityName(line.typeId, pi)}>
            {tr}
          </ItemContextMenu>
        )}
      />
    </Panel>
  );
}
