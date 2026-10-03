/**
 * "Find by goal": the pilot says what they want better — CPU, speed,
 * damage — and every implant that moves it on this Fitting is listed with
 * what each grade does and where to buy it. When the Fitting is over CPU or
 * powergrid, the cheapest ways back under budget come first.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, Spinner, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import {
  headroom,
  shortfall,
  withImplant,
  type ImplantGoal,
  type ImplantGoalId,
} from '@/engine/fittings/implantFinder';
import type { ImplantBasis } from '@/engine/fittings/implantBasis';
import type {
  Fitting,
  FittingImplantSet,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub } from '@/market/hubs';
import { PriceHubSelect } from './PriceHubSelect';
import {
  useImplantFinder,
  type FamilyResult,
  type FixResult,
  type GradeResult,
} from './useImplantFinder';

/** How a goal's figure is shown: decimals, and a divisor into the page's unit (lock range m → km). */
const GOAL_DISPLAY: Record<ImplantGoalId, { decimals: number; divisor?: number }> = {
  cpu: { decimals: 1 },
  powergrid: { decimals: 1 },
  capacitorCapacity: { decimals: 0 },
  capacitorRecharge: { decimals: 1 },
  damage: { decimals: 1 },
  ehp: { decimals: 0 },
  repair: { decimals: 1 },
  speed: { decimals: 0 },
  agility: { decimals: 3 },
  lockRange: { decimals: 1, divisor: 1000 },
  scanResolution: { decimals: 0 },
};

function displayValue(goal: ImplantGoal, stats: FittingStats): number {
  const value = goal.kind === 'budget' ? goal.read(stats).used : goal.read(stats);
  return value / (GOAL_DISPLAY[goal.id].divisor ?? 1);
}

function fmt(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SectionHeading({ children, warning }: { children: ReactNode; warning?: boolean }) {
  return (
    <p
      className={cx(
        'text-[0.6875rem] font-semibold tracking-widest uppercase',
        warning ? 'text-warning' : 'text-text-dim'
      )}
    >
      {children}
    </p>
  );
}

function SuccessBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-xs bg-success px-1.5 text-[0.625rem] font-bold tracking-wider text-accent-contrast uppercase">
      {children}
    </span>
  );
}

interface ImplantFinderProps {
  open: boolean;
  fitting: Fitting;
  profile: PilotProfile;
  /** Which implants the page's own numbers use; the finder always works on the Fitting's set. */
  basis: ImplantBasis;
  implantSet: FittingImplantSet | undefined;
  onChange: (implantSet: FittingImplantSet | undefined) => void;
}

export function ImplantFinder({
  open,
  fitting,
  profile,
  basis,
  implantSet,
  onChange,
}: ImplantFinderProps) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const [goalId, setGoalId] = useState<ImplantGoalId | null>(null);
  const [query, setQuery] = useState('');
  const finder = useImplantFinder({ open, fitting, profile, goalId, hubId });
  const { baseline, catalog } = finder;

  const unit = (id: ImplantGoalId) => t(`fittings.implantFinder.unit.${id}`);
  const label = (id: ImplantGoalId) => t(`fittings.implantFinder.goals.${id}`);

  /** Every implant's full name with its grade code, for fix options and button labels. */
  const names = useMemo(() => {
    const map = new Map<number, string>();
    for (const family of catalog?.families ?? []) {
      for (const grade of family.grades) {
        map.set(grade.typeId, grade.code ? `${family.name} ${grade.code}` : family.name);
      }
    }
    return map;
  }, [catalog]);

  function setImplants(next: readonly number[]) {
    onChange({ ...(implantSet ?? { boosters: [] }), implants: [...next] });
  }
  function addAll(typeIds: readonly number[]) {
    if (!catalog) return;
    let next: readonly number[] = implantSet?.implants ?? [];
    for (const id of typeIds) next = withImplant(next, catalog.slotOf, id);
    setImplants(next);
  }
  function remove(typeId: number) {
    setImplants((implantSet?.implants ?? []).filter((id) => id !== typeId));
  }

  const q = query.trim().toLowerCase();
  const visibleGoals = finder.goals.filter(
    ({ goal }) => !q || label(goal.id).toLowerCase().includes(q)
  );
  /** How far over budget a goal is; 0 for one that fits or isn't a budget. */
  const overBy = (g: ImplantGoal) =>
    baseline && g.kind === 'budget' ? shortfall(g.read(baseline)) : 0;
  const problems = visibleGoals.filter(({ goal }) => overBy(goal) > 0);
  const others = visibleGoals.filter(({ goal }) => overBy(goal) === 0);
  const goal = finder.goals.find((g) => g.goal.id === goalId)?.goal ?? null;

  if (finder.status === 'error') {
    return <p className="p-3 text-sm text-danger">{t('fittings.implantFinder.error')}</p>;
  }
  if (finder.status === 'loading' || !baseline) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-text-dim">
        <Spinner size="sm" />
        {finder.progress.total > 0
          ? t('fittings.implantFinder.loading', finder.progress)
          : t('fittings.implantFinder.loadingCatalog')}
      </div>
    );
  }

  const goalButton = (id: ImplantGoalId, badge?: string) => (
    <li key={id}>
      <button
        type="button"
        aria-pressed={goalId === id}
        onClick={() => setGoalId(id)}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 rounded-xs border px-2 text-left text-sm md:min-h-8',
          goalId === id
            ? 'border-accent-dim bg-panel-2 text-accent'
            : 'border-transparent hover:bg-panel-2'
        )}
      >
        <span className="flex-1">{label(id)}</span>
        {badge && <span className="text-xs text-warning tabular-nums">{badge}</span>}
        <Icon.Descend aria-hidden className="text-text-dim md:hidden" />
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PriceHubSelect />
        {finder.updating && (
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <Spinner size="sm" />
            {t('fittings.implantFinder.updating')}
          </span>
        )}
        {basis === 'clone' && (
          <p className="text-xs text-text-dim">{t('fittings.implantFinder.cloneBasisNote')}</p>
        )}
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <nav
          aria-label={t('fittings.implantFinder.goalsLabel')}
          className={cx('space-y-3 md:block md:w-56 md:shrink-0', goal !== null && 'hidden')}
        >
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('fittings.implantFinder.searchPlaceholder')}
            aria-label={t('fittings.implantFinder.searchLabel')}
          />
          {problems.length > 0 && (
            <div className="space-y-1">
              <SectionHeading warning>{t('fittings.implantFinder.fixHeading')}</SectionHeading>
              <ul className="space-y-0.5">
                {problems.map(({ goal: g }) =>
                  goalButton(
                    g.id,
                    t('fittings.implantFinder.over', {
                      value: fmt(overBy(g), GOAL_DISPLAY[g.id].decimals),
                      unit: unit(g.id),
                    })
                  )
                )}
              </ul>
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-1">
              <SectionHeading>{t('fittings.implantFinder.improveHeading')}</SectionHeading>
              <ul className="space-y-0.5">{others.map(({ goal: g }) => goalButton(g.id))}</ul>
            </div>
          )}
          {visibleGoals.length === 0 && (
            <p className="text-sm text-text-dim">{t('fittings.implantFinder.noGoalMatch')}</p>
          )}
        </nav>

        <section className={cx('min-w-0 flex-1 space-y-3', !goal && 'hidden md:block')}>
          {!goal ? (
            <p className="text-sm text-text-dim">{t('fittings.implantFinder.pickGoal')}</p>
          ) : (
            <GoalResults
              goal={goal}
              baseline={baseline}
              results={finder.results}
              fixes={finder.fixes}
              hubId={hubId}
              unit={unit(goal.id)}
              label={label(goal.id)}
              names={names}
              busy={finder.updating}
              onBack={() => setGoalId(null)}
              onAdd={addAll}
              onRemove={remove}
            />
          )}
        </section>
      </div>
    </div>
  );
}

interface GoalResultsProps {
  goal: ImplantGoal;
  baseline: FittingStats;
  results: FamilyResult[] | null;
  fixes: FixResult[];
  hubId: string;
  unit: string;
  label: string;
  names: Map<number, string>;
  /** The shown results are from before the last change; their buttons wait for the new ones. */
  busy: boolean;
  onBack: () => void;
  onAdd: (typeIds: readonly number[]) => void;
  onRemove: (typeId: number) => void;
}

/** What an implant (or a fix) does to the goal, and whether that's good news. */
interface Effect {
  text: string;
  fits: boolean;
}

function GoalResults({
  goal,
  baseline,
  results,
  fixes,
  hubId,
  unit,
  label,
  names,
  busy,
  onBack,
  onAdd,
  onRemove,
}: GoalResultsProps) {
  const { t } = useTranslation();
  const { decimals } = GOAL_DISPLAY[goal.id];
  const hubName = (id: string) => getTradeHub(id)?.systemName ?? id;
  const n = (value: number) => fmt(value, decimals);

  function effect(after: FittingStats): Effect {
    if (goal.kind === 'budget') {
      const budget = goal.read(after);
      const over = shortfall(budget);
      return over > 0
        ? { text: t('fittings.implantFinder.stillOver', { value: n(over), unit }), fits: false }
        : {
            text: t('fittings.implantFinder.fitsSpare', { value: n(headroom(budget)), unit }),
            fits: true,
          };
    }
    const before = displayValue(goal, baseline);
    const now = displayValue(goal, after);
    const pct = before === 0 ? 0 : ((now - before) / Math.abs(before)) * 100;
    return {
      text: t('fittings.implantFinder.delta', {
        before: n(before),
        after: n(now),
        unit,
        pct: `${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 1)}%`,
      }),
      fits: true,
    };
  }

  const budget = goal.kind === 'budget' ? goal.read(baseline) : null;
  const over = budget ? shortfall(budget) : 0;
  const firstFix = fixes[0];
  const fixHeadroom = (fix: FixResult) =>
    goal.kind === 'budget' ? headroom(goal.read(fix.stats)) : 0;

  return (
    <>
      <div className="space-y-1">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-1 text-sm text-accent md:hidden"
        >
          <Icon.Back aria-hidden />
          {t('fittings.implantFinder.back')}
        </button>
        <h3 className="text-base font-semibold">{label}</h3>
        <p className="text-sm text-text-dim tabular-nums">
          {budget
            ? t(
                over > 0
                  ? 'fittings.implantFinder.budgetOver'
                  : 'fittings.implantFinder.budgetSpare',
                {
                  used: n(budget.used),
                  total: n(budget.total),
                  value: n(over > 0 ? over : headroom(budget)),
                  unit,
                }
              )
            : `${n(displayValue(goal, baseline))} ${unit}`}
        </p>
      </div>

      {fixes.length > 0 && firstFix && (
        <div className="space-y-1.5">
          <SectionHeading>{t('fittings.implantFinder.fixesHeading')}</SectionHeading>
          <ul className="space-y-1.5">
            {fixes.map((fix, i) => (
              <li
                key={fix.typeIds.join('+')}
                className={cx(
                  'flex flex-col gap-2 rounded-xs border p-2.5 sm:flex-row sm:items-center',
                  i === 0 ? 'border-success/50 bg-success/5' : 'border-line bg-panel-2'
                )}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {fix.typeIds.map((id) => names.get(id) ?? String(id)).join(' + ')}
                    </span>
                    {i === 0 ? (
                      <SuccessBadge>{t('fittings.implantFinder.cheapest')}</SuccessBadge>
                    ) : (
                      <span className="text-xs text-text-dim">
                        {t('fittings.implantFinder.moreHeadroom', {
                          cost: formatIskCompact(fix.cost - firstFix.cost),
                          value: n(fixHeadroom(fix) - fixHeadroom(firstFix)),
                          unit,
                        })}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-success tabular-nums">{effect(fix.stats).text}</p>
                </div>
                <span className="font-semibold whitespace-nowrap tabular-nums">
                  {t('fittings.implantFinder.isk', { value: formatIskCompact(fix.cost) })}
                </span>
                <Button variant="primary" disabled={busy} onClick={() => onAdd(fix.typeIds)}>
                  {fix.typeIds.length > 1
                    ? t('fittings.implantFinder.addAll')
                    : t('fittings.implantFinder.add')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <SectionHeading>{t('fittings.implantFinder.helpersHeading')}</SectionHeading>
        {results === null ? (
          <p className="flex items-center gap-2 text-sm text-text-dim">
            <Spinner size="sm" />
            {t('fittings.implantFinder.loadingGrades')}
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-text-dim">{t('fittings.implantFinder.nothingHelps')}</p>
        ) : (
          <ul className="space-y-2">
            {results.map(({ family, grades }) => {
              const lowest = family.grades[0]!;
              const highest = family.grades[family.grades.length - 1]!;
              return (
                <li
                  key={family.key}
                  className="space-y-1 rounded-xs border border-line bg-panel-2 p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <TypeIcon typeId={highest.typeId} size={32} width={28} height={28} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{family.name}</p>
                      <p className="text-xs text-text-dim">
                        {family.grades.length > 1
                          ? t('fittings.implantFinder.slotGrades', {
                              slot: family.slot,
                              low: lowest.code,
                              high: highest.code,
                            })
                          : t('fittings.implantFinder.slot', { slot: family.slot })}
                      </p>
                    </div>
                  </div>
                  <ul>
                    {grades.map((row) => {
                      const rowEffect = effect(row.stats);
                      return (
                        <GradeRow
                          key={row.grade.typeId}
                          row={row}
                          name={names.get(row.grade.typeId) ?? family.name}
                          effect={rowEffect}
                          fixesIt={over > 0 && rowEffect.fits && !row.inSet}
                          replacesName={
                            row.replaces === null ? null : (names.get(row.replaces) ?? null)
                          }
                          hubName={hubName}
                          busy={busy}
                          onAdd={(id) => onAdd([id])}
                          onRemove={onRemove}
                        />
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-text-dim">
        {t('fittings.implantFinder.pricedAt', { hub: hubName(hubId) })}
      </p>
    </>
  );
}

function GradeRow({
  row,
  name,
  effect,
  fixesIt,
  replacesName,
  hubName,
  busy,
  onAdd,
  onRemove,
}: {
  row: GradeResult;
  name: string;
  effect: Effect;
  fixesIt: boolean;
  replacesName: string | null;
  hubName: (id: string) => string;
  busy: boolean;
  onAdd: (typeId: number) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const { source } = row;
  const action = row.inSet
    ? t('fittings.implantFinder.remove')
    : row.replaces !== null
      ? t('fittings.implantFinder.replace')
      : t('fittings.implantFinder.add');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-1.5">
      <span className="w-20 font-semibold tabular-nums">{row.grade.code}</span>
      {fixesIt && <SuccessBadge>{t('fittings.implantFinder.fixesIt')}</SuccessBadge>}
      <span
        className={cx(
          'min-w-40 flex-1 text-xs tabular-nums',
          effect.fits ? 'text-success' : 'text-warning'
        )}
      >
        {effect.text}
      </span>
      <span
        className={cx(
          'basis-full text-xs tabular-nums sm:basis-64',
          !source ? 'text-text-dim' : source.atSelectedHub ? 'text-text' : 'text-warning'
        )}
      >
        {!source
          ? t('fittings.implantFinder.noSource')
          : t(
              source.atSelectedHub
                ? 'fittings.implantFinder.sourceHub'
                : 'fittings.implantFinder.sourceOther',
              {
                hub: hubName(source.hubId),
                price: formatIskCompact(source.price),
                count: source.volume,
              }
            )}
        {replacesName && !row.inSet && (
          <span className="block text-text-dim">
            {t('fittings.implantFinder.replaces', { name: replacesName })}
          </span>
        )}
      </span>
      <Button
        variant={row.inSet ? 'ghost' : 'primary'}
        disabled={busy}
        aria-label={t('fittings.implantFinder.actionLabel', { action, name })}
        onClick={() => (row.inSet ? onRemove(row.grade.typeId) : onAdd(row.grade.typeId))}
        className="ml-auto min-w-20"
      >
        {action}
      </Button>
    </li>
  );
}
