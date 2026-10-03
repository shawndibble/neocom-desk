/**
 * "Find by goal": the pilot says what they want better — CPU, speed,
 * damage — and every implant that moves it on this fit is listed with what
 * each grade does and where to buy it. When the fit is over CPU or
 * powergrid, the cheapest ways back under budget come first.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SearchInput, Spinner, TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import {
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
import { useImplantFinder, type FamilyResult, type GradeResult } from './useImplantFinder';

const DECIMALS: Record<ImplantGoalId, number> = {
  cpu: 1,
  powergrid: 1,
  capacitorCapacity: 0,
  capacitorRecharge: 1,
  damage: 1,
  ehp: 0,
  repair: 1,
  speed: 0,
  agility: 3,
  lockRange: 1,
  scanResolution: 0,
};

/** A goal's figure in the unit the page shows it in (lock range in km, not m). */
function displayValue(goal: ImplantGoal, stats: FittingStats): number {
  if (goal.kind === 'budget') return goal.read(stats).used;
  const value = goal.read(stats);
  return goal.id === 'lockRange' ? value / 1000 : value;
}

function fmt(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

  const names = useMemo(() => {
    const map = new Map<number, string>();
    for (const family of catalog?.families ?? []) {
      for (const grade of family.grades) {
        map.set(grade.typeId, grade.code ? `${family.name} ${grade.code}` : family.name);
      }
    }
    return map;
  }, [catalog]);
  const codeOf = (typeId: number) => {
    for (const family of catalog?.families ?? []) {
      const grade = family.grades.find((g) => g.typeId === typeId);
      if (grade) return grade.code ?? family.name;
    }
    return String(typeId);
  };

  function setImplants(next: readonly number[]) {
    onChange({ ...(implantSet ?? { boosters: [] }), implants: [...next] });
  }
  function add(typeId: number) {
    if (!catalog) return;
    setImplants(withImplant(implantSet?.implants ?? [], catalog.slotOf, typeId));
  }
  function addAll(typeIds: number[]) {
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
        <PriceHubSelect size="sm" />
        {finder.updating && (
          <span className="flex items-center gap-1.5 text-xs text-text-dim" role="status">
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
              <p className="text-[0.6875rem] font-semibold tracking-widest text-warning uppercase">
                {t('fittings.implantFinder.fixHeading')}
              </p>
              <ul className="space-y-0.5">
                {problems.map(({ goal: g }) =>
                  goalButton(
                    g.id,
                    t('fittings.implantFinder.over', { value: fmt(overBy(g), 1), unit: unit(g.id) })
                  )
                )}
              </ul>
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('fittings.implantFinder.improveHeading')}
              </p>
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
              codeOf={codeOf}
              onBack={() => setGoalId(null)}
              onAdd={add}
              onAddAll={addAll}
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
  fixes: { typeIds: number[]; cost: number; stats: FittingStats }[];
  hubId: string;
  unit: string;
  label: string;
  names: Map<number, string>;
  codeOf: (typeId: number) => string;
  onBack: () => void;
  onAdd: (typeId: number) => void;
  onAddAll: (typeIds: number[]) => void;
  onRemove: (typeId: number) => void;
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
  codeOf,
  onBack,
  onAdd,
  onAddAll,
  onRemove,
}: GoalResultsProps) {
  const { t } = useTranslation();
  const decimals = DECIMALS[goal.id];
  const hubName = (id: string) => getTradeHub(id)?.systemName ?? id;

  /** What one implant (or option) does to the goal, in words. */
  function effect(after: FittingStats): { text: string; tone: string } {
    if (goal.kind === 'budget') {
      const b = goal.read(after);
      const over = shortfall(b);
      return over > 0
        ? {
            text: t('fittings.implantFinder.stillOver', { value: fmt(over, decimals), unit }),
            tone: 'text-warning',
          }
        : {
            text: t('fittings.implantFinder.fitsSpare', {
              value: fmt(b.total - b.used, decimals),
              unit,
            }),
            tone: 'text-success',
          };
    }
    const before = displayValue(goal, baseline);
    const now = displayValue(goal, after);
    const pct = before === 0 ? 0 : ((now - before) / Math.abs(before)) * 100;
    return {
      text: t('fittings.implantFinder.delta', {
        before: fmt(before, decimals),
        after: fmt(now, decimals),
        unit,
        pct: `${pct >= 0 ? '+' : '−'}${fmt(Math.abs(pct), 1)}%`,
      }),
      tone: 'text-success',
    };
  }

  const budget = goal.kind === 'budget' ? goal.read(baseline) : null;
  const firstFix = fixes[0];

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
            ? t('fittings.implantFinder.budgetLine', {
                used: fmt(budget.used, decimals),
                total: fmt(budget.total, decimals),
                unit,
              }) +
              ' · ' +
              (shortfall(budget) > 0
                ? t('fittings.implantFinder.over', {
                    value: fmt(shortfall(budget), decimals),
                    unit,
                  })
                : t('fittings.implantFinder.spare', {
                    value: fmt(budget.total - budget.used, decimals),
                    unit,
                  }))
            : `${fmt(displayValue(goal, baseline), decimals)} ${unit}`}
        </p>
      </div>

      {fixes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('fittings.implantFinder.fixesHeading')}
          </p>
          <ul className="space-y-1.5">
            {fixes.map((fix, i) => {
              const spare = goal.kind === 'budget' ? goal.read(fix.stats) : null;
              const firstSpare =
                goal.kind === 'budget' && firstFix ? goal.read(firstFix.stats) : null;
              return (
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
                        {fix.typeIds.map((id) => names.get(id) ?? codeOf(id)).join(' + ')}
                      </span>
                      {i === 0 ? (
                        <span className="rounded-xs bg-success px-1.5 text-[0.625rem] font-bold tracking-wider text-accent-contrast uppercase">
                          {t('fittings.implantFinder.cheapest')}
                        </span>
                      ) : (
                        firstFix &&
                        spare &&
                        firstSpare && (
                          <span className="text-xs text-text-dim">
                            {t('fittings.implantFinder.moreHeadroom', {
                              cost: formatIskCompact(fix.cost - firstFix.cost),
                              value: fmt(
                                spare.total - spare.used - (firstSpare.total - firstSpare.used),
                                decimals
                              ),
                              unit,
                            })}
                          </span>
                        )
                      )}
                    </p>
                    {spare && (
                      <p className="text-xs text-success tabular-nums">
                        {t('fittings.implantFinder.budgetLine', {
                          used: fmt(spare.used, decimals),
                          total: fmt(spare.total, decimals),
                          unit,
                        })}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {t('fittings.implantFinder.isk', { value: formatIskCompact(fix.cost) })}
                  </span>
                  <Button variant="primary" size="sm" onClick={() => onAddAll(fix.typeIds)}>
                    {fix.typeIds.length > 1
                      ? t('fittings.implantFinder.addAll')
                      : t('fittings.implantFinder.add')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('fittings.implantFinder.helpersHeading')}
        </p>
        {results === null ? (
          <p className="flex items-center gap-2 text-sm text-text-dim">
            <Spinner size="sm" />
            {t('fittings.implantFinder.loadingGrades')}
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-text-dim">{t('fittings.implantFinder.nothingHelps')}</p>
        ) : (
          <ul className="space-y-2">
            {results.map((result) => (
              <li
                key={result.family.key}
                className="space-y-1 rounded-xs border border-line bg-panel-2 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <TypeIcon
                    typeId={result.family.grades[result.family.grades.length - 1]!.typeId}
                    size={32}
                    width={28}
                    height={28}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{result.family.name}</p>
                    <p className="text-xs text-text-dim">
                      {t('fittings.implantFinder.slot', { slot: result.family.slot })}
                      {result.family.grades.length > 1 &&
                        ' · ' +
                          t('fittings.implantFinder.gradesHelp', {
                            low: result.family.grades[0]!.code,
                            high: result.family.grades[result.family.grades.length - 1]!.code,
                          })}
                    </p>
                  </div>
                </div>
                <ul>
                  {result.grades.map((row) => (
                    <GradeRow
                      key={row.grade.typeId}
                      row={row}
                      name={names.get(row.grade.typeId) ?? result.family.name}
                      code={row.grade.code ?? ''}
                      effect={effect(row.stats)}
                      fixes={
                        budget !== null &&
                        shortfall(budget) > 0 &&
                        goal.kind === 'budget' &&
                        shortfall(goal.read(row.stats)) <= 0
                      }
                      replacesName={
                        row.replaces === null ? null : (names.get(row.replaces) ?? null)
                      }
                      hubName={hubName}
                      onAdd={onAdd}
                      onRemove={onRemove}
                    />
                  ))}
                </ul>
              </li>
            ))}
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
  code,
  effect,
  fixes,
  replacesName,
  hubName,
  onAdd,
  onRemove,
}: {
  row: GradeResult;
  name: string;
  code: string;
  effect: { text: string; tone: string };
  fixes: boolean;
  replacesName: string | null;
  hubName: (id: string) => string;
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
      <span className="w-20 font-semibold tabular-nums">{code}</span>
      {fixes && !row.inSet && (
        <span className="rounded-xs bg-success px-1.5 text-[0.625rem] font-bold tracking-wider text-accent-contrast uppercase">
          {t('fittings.implantFinder.fixesIt')}
        </span>
      )}
      <span className={cx('min-w-40 flex-1 text-xs tabular-nums', effect.tone)}>{effect.text}</span>
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
        size="sm"
        variant={row.inSet ? 'ghost' : 'primary'}
        aria-label={t('fittings.implantFinder.actionLabel', { action, name })}
        onClick={() => (row.inSet ? onRemove(row.grade.typeId) : onAdd(row.grade.typeId))}
        className="ml-auto min-w-20"
      >
        {action}
      </Button>
    </li>
  );
}
