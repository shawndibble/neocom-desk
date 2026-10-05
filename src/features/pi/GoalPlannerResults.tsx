/**
 * The Goal Planner's answer, in the order a pilot reads it: is it worth it
 * (Headline — the **Lift** over the **Baseline**, never a gross margin), what
 * stops it (Shortfalls), what to change (the change list), whether it fits
 * (Colony fit), what it costs to move (Hauling), and the whole demand (Flow).
 *
 * Every section is fed a computed answer; nothing here prices or plans.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import {
  DataTable,
  EmptyState,
  IskAmount,
  InfoTooltip,
  Panel,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PiData, PiFactoryKind } from '@/sde/types';
import type {
  ColonyAssignment,
  DemandLine,
  DemandSource,
  ExtractionSlot,
  FitLimit,
  RateSource,
  Shortfall,
} from '@/engine/pi/goalTypes';
import type { BestPlan } from '@/engine/pi/planBest';
import type { ColonyChange } from '@/engine/pi/planDiff';
import type { PinCounts } from '@/engine/pi/types';
import type { TradeHub } from '@/market/hubs';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatIskCompact } from '@/lib/isk';
import { DirectiveRow, EstimateBadge, LoadMeter } from './DirectiveRow';
import type { PlanHauling, PlanVerdict, PlannerColonyRow } from './goalPlannerModel';
import type { TotalColonyEarnings } from './colonyEarningsModel';
import { TierChip } from './TierChip';
import { commodityName, formatUnits } from './goalPlannerFormat';

const HOURS_PER_DAY = 24;
const M3_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const PERCENT_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

function namesList(typeIds: readonly number[], pi: PiData): string {
  return typeIds.map((id) => commodityName(id, pi)).join(', ');
}

/** A signed ISK/day figure: "+" spelled out, since the sign is the whole point of a Lift. */
function SignedIsk({ perHour, className = '' }: { perHour: number; className?: string }) {
  const perDay = perHour * HOURS_PER_DAY;
  return (
    <span className={`${perDay >= 0 ? 'text-isk-pos' : 'text-isk-neg'} ${className}`}>
      {perDay > 0 ? '+' : ''}
      <IskAmount value={perDay} revealOn="tap" decimals={0} />
    </span>
  );
}

function PerDayIsk({ perHour }: { perHour: number }) {
  return <IskAmount value={perHour * HOURS_PER_DAY} revealOn="tap" decimals={0} />;
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

function factoriesText(factories: PinCounts, t: TFunction): string {
  const parts: string[] = [];
  for (const kind of ['basic', 'advanced', 'highTech'] as const) {
    const count = factories[kind] ?? 0;
    if (count > 0) parts.push(t('piPlan.pinCount', { count, pin: facilityName(kind, t) }));
  }
  return parts.join(', ');
}

// --- Headline ------------------------------------------------------------

export interface HeadlineProps {
  best: BestPlan;
  earnings: TotalColonyEarnings;
  verdict: PlanVerdict | null;
  hasGoals: boolean;
  pi: PiData;
  hub: TradeHub;
}

function verdictText(verdict: PlanVerdict, liftPerDay: string, t: TFunction): string {
  const haul = verdict.haulChange;
  const haulPercent = haul === null ? '' : PERCENT_FORMAT.format(Math.abs(haul) * 100);
  switch (verdict.lift) {
    case 'more':
      return haul !== null && haul < -0.005
        ? t('piPlan.verdictMoreHaulsLess', { isk: liftPerDay, percent: haulPercent })
        : t('piPlan.verdictMore', { isk: liftPerDay });
    case 'less':
      return haul !== null && haul < -0.005
        ? t('piPlan.verdictLessHaulsLess', { isk: liftPerDay, percent: haulPercent })
        : t('piPlan.verdictLess', { isk: liftPerDay });
    case 'same':
      return t('piPlan.verdictSame');
  }
}

export function Headline({ best, earnings, verdict, hasGoals, pi, hub }: HeadlineProps) {
  const { t } = useTranslation();
  const { economics } = best;

  if (economics.status === 'needs-price') {
    return (
      <Panel title={t('piPlan.headlineTitle')}>
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

  const liftPerDay = Math.abs(economics.liftPerHour * HOURS_PER_DAY);
  const liftWords = formatIskCompact(liftPerDay);
  const unmet = best.plan.achieved.filter((goal) => goal.fraction < 0.999);
  const buysPerHour = economics.buys;
  const customsPerHour =
    economics.customs.exportFromExtractors +
    economics.customs.importToHost +
    economics.customs.exportFromHost;

  return (
    <Panel title={t('piPlan.headlineTitle')}>
      {hasGoals ? (
        <div className="space-y-3" data-testid="goal-plan-headline">
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
          </div>
          <p className="text-xs text-text-dim">{t('piPlan.liftExplain')}</p>
          {verdict && (
            <p className="text-sm text-text">
              {verdictText(verdict, liftWords, t)}
              {unmet.length > 0 &&
                ` ${t('piPlan.verdictUnmet', {
                  goals: unmet
                    .map((goal) =>
                      t('piPlan.shortAchievedGoal', {
                        name: commodityName(goal.typeId, pi),
                        percent: PERCENT_FORMAT.format(goal.fraction * 100),
                      })
                    )
                    .join(', '),
                })}`}
            </p>
          )}
          <StatChips>
            <StatChip
              label={t('piPlan.netPerDay')}
              value={<PerDayIsk perHour={economics.netPerHour} />}
            />
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
            <StatChip label={t('piPlan.buysPerDay')} value={<PerDayIsk perHour={buysPerHour} />} />
            <StatChip
              label={t('piPlan.customsPerDay')}
              value={<PerDayIsk perHour={customsPerHour} />}
            />
          </StatChips>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text">{t('piPlan.noGoalsPrompt')}</p>
          <StatChips>
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
          </StatChips>
        </div>
      )}
      {earnings.coloniesWithoutFigure > 0 && (
        <p className="mt-2 text-[0.6875rem] text-text-dim">
          {t('piPlan.earnsNowPartial', { count: earnings.coloniesWithoutFigure })}
        </p>
      )}
    </Panel>
  );
}

// --- Shortfalls ----------------------------------------------------------

function shortfallText(
  shortfall: Shortfall,
  pi: PiData,
  planetName: (id: number) => string,
  t: TFunction
): ReactNode {
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
          })}{' '}
          <Link className="text-accent hover:underline" to="/planetary-industry/advisor">
            {t('piPlan.openAdvisor')}
          </Link>
        </>
      );
    case 'budget-gap':
      return t('piPlan.shortBudgetGap', {
        p0: commodityName(shortfall.p0TypeId, pi),
        p1: commodityName(shortfall.p1TypeId, pi),
        rate: formatUnits(shortfall.unitsPerHour),
      });
    case 'no-factory-host':
      return t('piPlan.shortNoHost', { facility: facilityName(shortfall.facility, t) });
    case 'host-over-budget':
      return t('piPlan.shortHostOver', {
        name: planetName(shortfall.planetId),
        limits: limitsText(shortfall.limitedBy, t),
      });
  }
}

export function Shortfalls({
  shortfalls,
  achieved,
  pi,
  planetName,
}: {
  shortfalls: readonly Shortfall[];
  achieved: BestPlan['plan']['achieved'];
  pi: PiData;
  planetName: (id: number) => string;
}) {
  const { t } = useTranslation();
  if (shortfalls.length === 0) return null;
  const partial = achieved.filter((goal) => goal.fraction < 0.999);
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
            <span>{shortfallText(shortfall, pi, planetName, t)}</span>
          </li>
        ))}
      </ul>
      {partial.length > 0 && (
        <p className="mt-3 text-[0.6875rem] text-text-dim">
          {t('piPlan.shortAchieved', {
            goals: partial
              .map((goal) =>
                t('piPlan.shortAchievedGoal', {
                  name: commodityName(goal.typeId, pi),
                  percent: PERCENT_FORMAT.format(goal.fraction * 100),
                })
              )
              .join(', '),
          })}
        </p>
      )}
    </Panel>
  );
}

// --- Change list ---------------------------------------------------------

function ColonyLink({ name }: { name: string }) {
  return (
    <Link className="font-semibold text-text hover:underline" to="/planetary-industry">
      {name}
    </Link>
  );
}

function ChangeRow({
  change,
  pi,
  planetName,
  baselineP1s,
}: {
  change: ColonyChange;
  pi: PiData;
  planetName: (id: number) => string;
  baselineP1s: (planetId: number) => number[];
}) {
  const { t } = useTranslation();
  const name = <ColonyLink name={planetName(change.planetId)} />;
  switch (change.verb) {
    case 'keep':
      return change.notNeeded ? (
        <DirectiveRow verb="asIs">
          {name} {t('piPlan.changeNotNeeded', { p1s: namesList(baselineP1s(change.planetId), pi) })}
        </DirectiveRow>
      ) : (
        <DirectiveRow verb="asIs">
          {name} {t('piPlan.changeKeep', { p0s: namesList(change.p0TypeIds, pi) })}
        </DirectiveRow>
      );
    case 'add-extractor':
      return (
        <DirectiveRow verb="add">
          {name}{' '}
          {t('piPlan.changeAddExtractor', {
            add: namesList(change.add, pi),
            keep: namesList(change.keep, pi),
          })}
        </DirectiveRow>
      );
    case 'retarget':
      return (
        <DirectiveRow verb="swap">
          {name}{' '}
          {change.from.length === 0
            ? t('piPlan.changeStart', { to: namesList(change.to, pi) })
            : change.to.length > 0 && change.to.every((id) => change.from.includes(id))
              ? t('piPlan.changeStop', {
                  dropped: namesList(
                    change.from.filter((id) => !change.to.includes(id)),
                    pi
                  ),
                  keep: namesList(change.to, pi),
                })
              : t('piPlan.changeRetarget', {
                  from: namesList(change.from, pi),
                  to: namesList(change.to, pi),
                })}
        </DirectiveRow>
      );
    case 'convert-to-factory':
      return (
        <DirectiveRow verb="build">
          {name} {t('piPlan.changeHost', { factories: factoriesText(change.factories, t) })}
        </DirectiveRow>
      );
    case 'idle':
      return (
        <DirectiveRow verb="asIs">
          {name} {t('piPlan.changeIdle')}
        </DirectiveRow>
      );
  }
}

export function ChangeList({
  changes,
  pi,
  planetName,
  baselineP1s,
}: {
  changes: readonly ColonyChange[];
  pi: PiData;
  planetName: (id: number) => string;
  baselineP1s: (planetId: number) => number[];
}) {
  const { t } = useTranslation();
  if (changes.length === 0) return null;
  return (
    <Panel title={t('piPlan.changesTitle')}>
      <ul className="space-y-2">
        {changes.map((change) => (
          <li key={change.planetId}>
            <ChangeRow change={change} pi={pi} planetName={planetName} baselineP1s={baselineP1s} />
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
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text">
      <span>
        {t('piPlan.slotLine', {
          p0: commodityName(slot.p0TypeId, pi),
          p1: commodityName(slot.p1TypeId, pi),
          count: slot.ecus,
          rate: formatUnits(slot.p1PerHour),
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
  pi,
  planetName,
}: {
  assignments: readonly ColonyAssignment[];
  rows: readonly PlannerColonyRow[];
  pi: PiData;
  planetName: (id: number) => string;
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
          return (
            <li
              key={assignment.planetId}
              className="space-y-2 rounded-xs border border-line bg-panel-2/40 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-text">
                  {planetName(assignment.planetId)}
                </span>
                <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {roleText(assignment.role, t)}
                </span>
              </div>
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
              {assignment.limitedBy.length > 0 && (
                <p className="flex items-center gap-1 text-[0.6875rem] text-warning">
                  <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('piPlan.fitOver', { limits: limitsText(assignment.limitedBy, t) })}
                </p>
              )}
              {assignment.slots.length > 0 && (
                <ul className="space-y-1">
                  {assignment.slots.map((slot) => (
                    <SlotLine key={slot.p0TypeId} slot={slot} pi={pi} />
                  ))}
                </ul>
              )}
              {assignment.role === 'factory' && (
                <p className="text-xs text-text">{factoriesText(assignment.factories, t)}</p>
              )}
              {row && (row.headsAssumed || row.linkCostBorrowed) && (
                <p className="text-[0.6875rem] text-text-dim">
                  {row.headsAssumed && row.linkCostBorrowed
                    ? t('piPlan.fitBorrowedBoth', { heads: row.colony?.headsPerExtractor ?? 0 })
                    : row.headsAssumed
                      ? t('piPlan.fitBorrowedHeads', { heads: row.colony?.headsPerExtractor ?? 0 })
                      : t('piPlan.fitBorrowedLink')}
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
  outM3: number;
  inM3: number;
  jumps: number | null | undefined;
}

export function Hauling({
  hauling,
  jumpsByPlanet,
  haulDays,
  hub,
  planetName,
}: {
  hauling: PlanHauling;
  /** Jumps to the hub; `undefined` while still counting, null when there is no route. */
  jumpsByPlanet: ReadonlyMap<number, number | null>;
  haulDays: number;
  hub: TradeHub;
  planetName: (id: number) => string;
}) {
  const { t } = useTranslation();
  const rows: HaulRow[] = [...hauling.perColony]
    .map(([planetId, m3]) => ({ planetId, ...m3, jumps: jumpsByPlanet.get(planetId) }))
    .sort((a, b) => b.outM3 + b.inM3 - (a.outM3 + a.inM3));
  const change =
    hauling.baselineM3PerTrip > 0 ? hauling.planM3PerTrip / hauling.baselineM3PerTrip - 1 : null;
  const columns: DataTableColumn<HaulRow>[] = [
    {
      id: 'colony',
      header: t('piPlan.haulColony'),
      primary: true,
      render: (row) => planetName(row.planetId),
    },
    {
      id: 'out',
      header: t('piPlan.haulOut'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => t('piPlan.m3', { value: M3_FORMAT.format(row.outM3) }),
    },
    {
      id: 'in',
      header: t('piPlan.haulIn'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => t('piPlan.m3', { value: M3_FORMAT.format(row.inM3) }),
    },
    {
      id: 'jumps',
      header: t('piPlan.haulJumps', { hub: hub.systemName }),
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.jumps === undefined ? '…' : row.jumps === null ? '—' : String(row.jumps),
    },
  ];
  return (
    <Panel
      title={t('piPlan.haulTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim">
          {t('piPlan.haulPerTrip', { count: haulDays })}
        </span>
      }
    >
      <StatChips className="mb-2">
        <StatChip
          label={t('piPlan.haulPlanTotal')}
          value={t('piPlan.m3', { value: M3_FORMAT.format(hauling.planM3PerTrip) })}
        />
        <StatChip
          label={t('piPlan.haulBaselineTotal')}
          value={t('piPlan.m3', { value: M3_FORMAT.format(hauling.baselineM3PerTrip) })}
        />
        {change !== null && (
          <StatChip
            label={t('piPlan.haulChange')}
            tone={change < 0 ? 'success' : 'default'}
            value={
              change < 0
                ? t('piPlan.haulLess', { percent: PERCENT_FORMAT.format(-change * 100) })
                : t('piPlan.haulMore', { percent: PERCENT_FORMAT.format(change * 100) })
            }
          />
        )}
      </StatChips>
      {rows.length > 0 && (
        <DataTable
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
  }
}

const SOURCE_TONE: Record<DemandSource, string> = {
  made: 'text-text',
  extracted: 'text-text',
  'not-extracted': 'text-text-dim',
  bought: 'text-warning',
  short: 'text-danger',
};

export function Flow({
  demand,
  pi,
  hub,
}: {
  demand: readonly DemandLine[];
  pi: PiData;
  hub: TradeHub;
}) {
  const { t } = useTranslation();
  if (demand.length === 0) return null;
  const columns: DataTableColumn<DemandLine>[] = [
    {
      id: 'item',
      header: t('piPlan.flowItem'),
      primary: true,
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
      id: 'rate',
      header: t('piPlan.flowRate'),
      align: 'right',
      className: 'tabular-nums',
      render: (line) => formatUnits(line.unitsPerHour),
    },
    {
      id: 'factories',
      header: t('piPlan.flowFactories'),
      align: 'right',
      className: 'tabular-nums',
      render: (line) => (line.factories === null ? '—' : String(line.factories)),
    },
    {
      id: 'source',
      header: t('piPlan.flowSource'),
      render: (line) => (
        <span className={SOURCE_TONE[line.source]}>{sourceText(line.source, t)}</span>
      ),
    },
  ];
  return (
    <Panel title={t('piPlan.flowTitle')} padded={false}>
      <DataTable
        label={t('piPlan.flowTableLabel')}
        columns={columns}
        rows={demand}
        rowKey={(line) => line.typeId}
        density="compact"
        stackColumns={2}
      />
    </Panel>
  );
}
