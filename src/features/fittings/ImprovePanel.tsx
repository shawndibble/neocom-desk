/**
 * Improve's drawer body (scope decision `20261024-171917`): the Improve Goal
 * chips (a goal the fit cannot score is a disabled chip with its reason),
 * the goal's Guardrails as one plain line, then the search — progress with
 * Cancel, "Show best so far" after 10 s — and its results in two sections,
 * No downside and Trade-offs, never ranked against each other. Ticked rows
 * are applied together as one unsaved edit.
 */
import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  Checkbox,
  FilterChip,
  IskAmount,
  IskInput,
  ProgressBar,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Caret,
  StatChange,
  TypeIcon,
} from '@/components/ui';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import { commandOf } from '@/engine/fittings/improveCommand';
import { ewarOf, tackleOf } from '@/engine/fittings/improveTackle';
import { Collapse } from '@/components/ui/Collapse';
import { textActionClassName } from '@/components/ui/textActionClassName';
import {
  applyImproveCandidate,
  bestScore,
  damageOf,
  DEFENSE_CHOICES,
  goalAvailability,
  effectiveHold,
  remoteRepairOf,
  IMPROVE_GOALS,
  IMPROVE_HOLDS,
  IMPROVE_MODES,
  IMPROVE_REACHES,
  type DefenseChoice,
  type ImproveGoal,
  type ImproveHold,
  type ImproveMode,
  type ImproveReach,
  type ImproveOption,
  type ImproveResult,
  type RejectedOption,
} from '@/engine/fittings/improve';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import type { Resource } from '@/engine/fittings/makeItFit';
import { formatIskCompact } from '@/lib/isk';
import { createNumberFormat } from '@/lib/numberLocale';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { groupByModule, IMPROVE_SORTS, type ImproveSort } from '@/engine/fittings/improveRows';
import { summariseSelection } from '@/engine/fittings/improveSelection';
import { diffFittingStats } from '@/engine/fittings/variationDelta';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { MakeItFitSection } from './MakeItFitSection';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { ImproveSearch } from './useImprove';

/** How many stat changes a row spells out before counting the rest. */
const CHANGES_SHOWN = 4;

const m3sFormat = createNumberFormat({ maximumFractionDigits: 1 });
const m3Format = createNumberFormat({ maximumFractionDigits: 0 });
const twoDecimals = createNumberFormat({ maximumFractionDigits: 2 });

/** The furthest a turret's optimal or a missile's range reaches, in km. */
const reachKm = (s: FittingStats) =>
  Math.max(
    0,
    ...s.applied.weapons.map((w) =>
      w.kind === 'turret' ? w.optimal : w.kind === 'missile' ? w.range : 0
    )
  ) / 1000;

const alignOf = (s: FittingStats) => alignTimeSeconds(s.navigation.mass, s.navigation.agility);

const isResource = (key: string) => /^(cpu|powergrid|calibration)/.test(key);

const moveKey = (candidate: ImproveOption['candidate']): string =>
  `${candidate.fromTypeId ?? 'empty'}-${candidate.toTypeId}-${candidate.at[0].slot}${candidate.at[0].slotIndex}` +
  (candidate.pairedWith ? `+${moveKey(candidate.pairedWith)}` : '');

const optionKey = (option: ImproveOption) => moveKey(option.candidate);

/** Every slot a suggestion changes, its paired downgrade's included: two ticked rows never share one. */
function slotsOf(candidate: ImproveOption['candidate']): string[] {
  const own = candidate.at.map((at) => `${at.slot}${at.slotIndex}`);
  return candidate.pairedWith ? [...own, ...slotsOf(candidate.pairedWith)] : own;
}

/** What the drawer asks of a search beyond the goal; the hook that owns the state passes it whole. */
export interface ImproveSettings {
  reach: ImproveReach;
  onReachChange: (reach: ImproveReach) => void;
  /** How each section's rows are ordered. */
  sort: ImproveSort;
  onSortChange: (sort: ImproveSort) => void;
  mode: ImproveMode;
  onModeChange: (mode: ImproveMode) => void;
  /** Total budget (planning) or extra-spend cap (refitting) in ISK; null is no limit. */
  spendCap: number | null;
  onSpendCapChange: (cap: number | null) => void;
  defense: DefenseChoice;
  onDefenseChange: (defense: DefenseChoice) => void;
  includeRigs: boolean;
  onIncludeRigsChange: (on: boolean) => void;
  includeOfficer: boolean;
  onIncludeOfficerChange: (on: boolean) => void;
  /** Mine more: the crystal family (ore) the miners are scored with. */
  oreFamily: string;
  onOreFamilyChange: (family: string) => void;
  /** Carry more: the hold scored. */
  hold: ImproveHold;
  onHoldChange: (hold: ImproveHold) => void;
}

interface Props {
  goal: ImproveGoal;
  onGoalChange: (goal: ImproveGoal) => void;
  search: ImproveSearch;
  catalogue: FittingCatalogue | null;
  onApply: (options: ImproveOption[]) => void;
  settings: ImproveSettings;
  /** Opens Make it fit on that budget, from "Fix this first". */
  onFixFirst: (resource: Resource) => void;
  /** Weapons holding no charge, which damage goals can't score; null or absent: none. */
  unloaded?: UnloadedWeapons | null;
  /** Loads the best charge into each empty weapon group; absent when none can be loaded. */
  onLoadBestCharge?: () => void;
  /** Train and Implants, which cost the fit nothing and sit above the swaps; none for an over-budget fit. */
  freeSections?: ReactNode;
  /** The open Fitting, to check the ticked rows together; absent: no combined check. */
  fitting?: Fitting | null;
  /** The page's Target Profile, for the summary's DPS. */
  target?: TargetProfile;
}

/** The guardrail a rejected swap broke; a budget or cap says by how much. */
function brokeText(
  t: TFunction,
  option: RejectedOption,
  { mode, spendCap }: Pick<ImproveSettings, 'mode' | 'spendCap'>,
  fitTotal: number | null
): string {
  if (option.guardrail !== 'spend' || spendCap === null || option.iskDelta === null)
    return t(`fittings.improve.broke.${option.guardrail}`);
  const planning = mode === 'buy';
  const over = (planning ? (fitTotal ?? 0) + option.iskDelta : option.iskDelta) - spendCap;
  return t(planning ? 'fittings.improve.broke.spendBudget' : 'fittings.improve.broke.spendCap', {
    over: formatIskCompact(over),
    cap: formatIskCompact(spendCap),
  });
}

const NO_TICKS: ReadonlyMap<string, ImproveOption> = new Map();
const NO_OPEN: ReadonlySet<string> = new Set();

export function ImprovePanel({
  goal,
  onGoalChange,
  search,
  catalogue,
  onApply,
  settings,
  onFixFirst,
  unloaded,
  onLoadBestCharge,
  freeSections,
  fitting,
  target,
}: Props) {
  const { t } = useTranslation();
  const moreId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const { sort, onSortChange: setSort } = settings;
  // Modules whose other options, and rows whose other stats, are showing; like ticks, they belong to one result.
  const [open, setOpen] = useState<{ result: ImproveResult | null; keys: ReadonlySet<string> }>({
    result: null,
    keys: new Set(),
  });
  // Ticked rows, by key; at most one per fitted module (ticking another variation of it unticks the first).
  // Ticks belong to the result they were made in: a new search (a goal
  // change, an edit to the fit) starts with none.
  const [ticks, setTicks] = useState<{
    result: ImproveResult | null;
    byModule: ReadonlyMap<string, ImproveOption>;
    /** For a ticked row, the label of the pick it displaced. */
    replaced: ReadonlyMap<string, string>;
  }>({ result: null, byModule: new Map(), replaced: new Map() });
  const { state, before, hull } = search;
  const result = state.status === 'done' ? state.result : null;
  const expanded = open.result === result ? open.keys : NO_OPEN;
  const flip = (key: string) =>
    setOpen({
      result,
      keys: new Set(
        expanded.has(key) ? [...expanded].filter((k) => k !== key) : [...expanded, key]
      ),
    });
  const ticked = ticks.result === result ? ticks.byModule : NO_TICKS;
  const replaced = ticks.result === result ? ticks.replaced : new Map<string, string>();
  const setTicked = (
    byModule: ReadonlyMap<string, ImproveOption>,
    nextReplaced: ReadonlyMap<string, string> = new Map()
  ) => setTicks({ result, byModule, replaced: nextReplaced });
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);

  const moveLabel = (candidate: ImproveOption['candidate']) =>
    candidate.fromTypeId === null
      ? t('fittings.improve.fill', { count: candidate.at.length, to: name(candidate.toTypeId) })
      : t('fittings.improve.swap', {
          count: candidate.at.length,
          from: name(candidate.fromTypeId),
          to: name(candidate.toTypeId),
        });
  const swapLabel = (option: ImproveOption) =>
    option.candidate.pairedWith
      ? t('fittings.improve.pair', {
          add: moveLabel({ ...option.candidate, pairedWith: undefined }),
          downgrade: moveLabel(option.candidate.pairedWith),
        })
      : moveLabel(option.candidate);

  /** The swap's other changes; `onOpen` makes the "N other stats" tail a button that spells them out. */
  function changeLine(
    option: ImproveOption | RejectedOption,
    own: FittingStats,
    all = false,
    onOpen?: () => void
  ): ReactNode {
    // What the swap does first; the CPU, powergrid and calibration it takes after.
    const changes = [...diffFittingStats(own, option.after).changes].sort(
      (a, b) => Number(isResource(a.key)) - Number(isResource(b.key))
    );
    const shown: ReactNode[] = changes
      .slice(0, all ? undefined : CHANGES_SHOWN)
      .map((change) => <StatChange key={change.key} change={change} />);
    const rest = changes.length - shown.length;
    if (rest > 0) {
      const label = t('fittings.makeItFit.otherStats', { count: rest });
      shown.push(
        onOpen ? (
          <button key="rest" type="button" className={textActionClassName()} onClick={onOpen}>
            {label}
          </button>
        ) : (
          label
        )
      );
    }
    if (shown.length === 0) return t('fittings.variations.noChanges');
    return shown.flatMap((node, i) => (i === 0 ? [node] : [', ', node]));
  }

  function isk(option: ImproveOption) {
    if (option.iskDelta === null)
      return <span className="text-text-dim">{t('fittings.improve.noPrice')}</span>;
    return option.iskDelta < 0 ? (
      <span className="text-success">
        {t('fittings.makeItFit.saves')} <IskAmount value={-option.iskDelta} />
      </span>
    ) : (
      <span>
        {t('fittings.makeItFit.costs')} <IskAmount value={option.iskDelta} />
      </span>
    );
  }

  /** Mine more: the ore the row is scored with, and the m³/s it gives. */
  function oreLine(option: ImproveOption | RejectedOption, own: FittingStats) {
    const family = settings.oreFamily;
    return t('fittings.improve.oreLine', {
      ores: (CRYSTAL_FAMILY_ORES[family] ?? []).join(', '),
      family,
      before: m3sFormat(own.mining.perSecond),
      after: m3sFormat(option.after.mining.perSecond),
    });
  }

  /** Carry more, the align goals, Repair more, Transfer more, Hold tighter, Stronger EWAR, Stronger fleet support: the figure the goal scores, before and after. */
  function moveLine(option: ImproveOption | RejectedOption, own: FittingStats): string | null {
    const align = () =>
      t('fittings.improve.alignLine', {
        before: twoDecimals(alignOf(own)),
        after: twoDecimals(alignOf(option.after)),
      });
    if (goal === 'haul') {
      const hold = effectiveHold(own.holds, settings.hold);
      return t('fittings.improve.holdLine', {
        hold: t(`fittings.improve.hold.${hold}`),
        before: m3Format(own.holds[hold]),
        after: m3Format(option.after.holds[hold]),
      });
    }
    if (goal === 'repair')
      return t('fittings.improve.repairLine', {
        before: m3sFormat(remoteRepairOf(own)),
        after: m3sFormat(remoteRepairOf(option.after)),
      });
    if (goal === 'transfer')
      return t('fittings.improve.transferLine', {
        before: m3sFormat(own.support.capTransfer),
        after: m3sFormat(option.after.support.capTransfer),
      });
    if (goal === 'tackle') {
      const [was, now] = [tackleOf(own), tackleOf(option.after)];
      return t('fittings.improve.tackleLine', {
        pointsBefore: m3sFormat(was.points),
        pointsAfter: m3sFormat(now.points),
        webBefore: m3sFormat(was.web),
        webAfter: m3sFormat(now.web),
        rangeBefore: m3sFormat(was.range / 1000),
        rangeAfter: m3sFormat(now.range / 1000),
      });
    }
    if (goal === 'command') {
      const [was, now] = [commandOf(own), commandOf(option.after)];
      return (['strength', 'burstRange', 'compression', 'fuel'] as const)
        .filter((key) => was[key] > 0)
        .map((key) => {
          const km = key === 'burstRange' || key === 'compression' ? 1000 : 1;
          return t(`fittings.improve.command.${key}`, {
            before: m3sFormat(was[key] / km),
            after: m3sFormat(now[key] / km),
          });
        })
        .join(' · ');
    }
    if (goal === 'ewar') {
      const [was, now] = [ewarOf(own), ewarOf(option.after)];
      return t('fittings.improve.ewarLine', {
        strengthBefore: m3sFormat(was.strength),
        strengthAfter: m3sFormat(now.strength),
        rangeBefore: m3sFormat(was.range / 1000),
        rangeAfter: m3sFormat(now.range / 1000),
      });
    }
    if (goal === 'align') return align();
    if (goal === 'warp')
      return t('fittings.improve.warpLine', {
        align: align(),
        before: twoDecimals(own.navigation.warpSpeed),
        after: twoDecimals(option.after.navigation.warpSpeed),
      });
    return null;
  }

  /** The goal's own figure, before → after, first on every row. */
  function leadLine(option: ImproveOption, own: FittingStats): ReactNode {
    const stat = (key: 'sustainedDps' | 'ehp' | 'maxVelocity', before: number, after: number) => (
      <StatChange key={key} change={{ key, before, after }} />
    );
    const dps = () => stat('sustainedDps', damageOf(own, target), damageOf(option.after, target));
    const tank = () => stat('ehp', own.ehp, option.after.ehp);
    switch (goal) {
      case 'damage':
        return dps();
      case 'tank':
        return tank();
      case 'overall':
        return (
          <>
            {dps()}
            {', '}
            {tank()}
          </>
        );
      case 'speed':
        return stat('maxVelocity', own.navigation.maxVelocity, option.after.navigation.maxVelocity);
      case 'reach':
        return t('fittings.improve.reachLine', {
          before: m3sFormat(reachKm(own)),
          after: m3sFormat(reachKm(option.after)),
        });
      case 'mining':
        return oreLine(option, own);
      default:
        return moveLine(option, own);
    }
  }

  function toggle(option: ImproveOption) {
    const next = new Map(ticked);
    const nextReplaced = new Map(replaced);
    const key = optionKey(option);
    if (next.has(key)) {
      next.delete(key);
      nextReplaced.delete(key);
    } else {
      const taken = new Set(slotsOf(option.candidate));
      for (const [other, pick] of next)
        if (slotsOf(pick.candidate).some((slot) => taken.has(slot))) {
          next.delete(other);
          nextReplaced.delete(other);
          nextReplaced.set(
            key,
            [nextReplaced.get(key), swapLabel(pick)].filter(Boolean).join(', ')
          );
        }
      next.set(key, option);
    }
    setTicked(next, nextReplaced);
  }

  function optionRow(option: ImproveOption, own: FittingStats, section: string) {
    const id = `improve-${section}-${optionKey(option)}`;
    const statsKey = `stats:${id}`;
    const lead = leadLine(option, own);
    return (
      <li key={optionKey(option)} className="border-line rounded-xs border p-2 text-sm">
        <label
          htmlFor={id}
          className={cx('flex cursor-pointer items-start gap-2', tappableRowClassName)}
        >
          <Checkbox
            id={id}
            className="mt-0.5"
            checked={ticked.has(optionKey(option))}
            onChange={() => toggle(option)}
          />
          <TypeIcon typeId={option.candidate.toTypeId} size={32} width={24} height={24} />
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="font-medium">{swapLabel(option)}</span>
              {goal !== 'cheaper' && (
                <span className="text-success shrink-0 text-xs font-medium">
                  {t('fittings.improve.gain', { percent: m3sFormat(option.score * 100) })}
                </span>
              )}
            </span>
            {lead && <span className="block text-xs">{lead}</span>}
            <span className="text-text-dim block text-xs">
              {changeLine(option, own, expanded.has(statsKey), () => flip(statsKey))}
            </span>
            {option.downsides.length > 0 && (
              <span className="text-warning block text-xs">
                {t('fittings.improve.givesUp', {
                  stats: option.downsides
                    .map((metric) => t(`fittings.whatToTrain.sort.${metric}`))
                    .join(', '),
                })}
              </span>
            )}
            <span className="block text-xs">{isk(option)}</span>
            {replaced.has(optionKey(option)) && ticked.has(optionKey(option)) && (
              <span className="text-text-dim block text-xs">
                {t('fittings.improve.replacesPick', { swap: replaced.get(optionKey(option)) })}
              </span>
            )}
            {option.destroysRigs && (
              <span className="text-warning block text-xs">
                {t('fittings.improve.destroysRig')}
              </span>
            )}
          </span>
        </label>
      </li>
    );
  }

  function rows(options: ImproveOption[], own: FittingStats, section: string) {
    return (
      <ul className="space-y-1">
        {groupByModule(options, sort).map((group, index) => {
          const all = [group.best, ...group.others];
          // A ticked alternative takes the row's place; the rest stay behind it.
          const shown = all.find((option) => ticked.has(optionKey(option))) ?? group.best;
          const rest = all.filter((option) => option !== shown);
          const groupKey = `${section}:${group.key}`;
          const isOpen = expanded.has(groupKey);
          const listId = `${moreId}-${section}-${index}`;
          return (
            <Fragment key={group.key}>
              {optionRow(shown, own, section)}
              {rest.length > 0 && (
                <li className="pl-2">
                  <button
                    type="button"
                    className={textActionClassName()}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    onClick={() => flip(groupKey)}
                  >
                    {t('fittings.improve.moreOptions', { count: rest.length })}
                    <Caret expanded={isOpen} />
                  </button>
                  <Collapse open={isOpen} id={listId} className="pt-1">
                    <ul className="space-y-1">
                      {rest.map((option) => optionRow(option, own, section))}
                    </ul>
                  </Collapse>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
    );
  }

  const chosen = useMemo(() => [...ticked.values()], [ticked]);

  // The rows were each scored alone: one recalculation of the ticked set checks them together.
  const chosenKey = chosen.map(optionKey).sort().join('|');
  const recalc = search.recalc;
  const [combined, setCombined] = useState<{
    key: string;
    fitting: Fitting;
    after: FittingStats | null;
  } | null>(null);
  useEffect(() => {
    if (!fitting || !recalc || chosen.length === 0) return;
    let stale = false;
    const folded = chosen.reduce(
      (acc, pick) => applyImproveCandidate(acc, pick.candidate),
      fitting
    );
    recalc(folded)
      .then((after) => !stale && setCombined({ key: chosenKey, fitting, after }))
      .catch(() => !stale && setCombined({ key: chosenKey, fitting, after: null }));
    return () => {
      stale = true;
    };
  }, [fitting, recalc, chosen, chosenKey]);
  const checkable = Boolean(fitting && recalc && state.status === 'done');
  const checked =
    combined?.key === chosenKey && combined.fitting === fitting ? combined.after : undefined;
  const summary =
    checkable && checked && state.status === 'done'
      ? summariseSelection({
          options: chosen,
          before: state.before,
          after: checked,
          mode: settings.mode,
          spendCap: settings.spendCap,
          fitTotal: state.fitTotal,
          target,
        })
      : null;
  // A pending check holds Apply back; a failed one (each row was valid alone) warns but does not block.
  const canApply =
    chosen.length > 0 &&
    (!checkable || checked === null || (summary !== null && summary.problems.length === 0));

  // A blank hull has no fitted module to vary: the empty state must not talk about one.
  const noModules = fitting?.modules.length === 0;
  // A fit that doesn't fit has nothing to improve yet: hand over to Make it fit (`20261019-144736`).
  if (state.status === 'overBudget')
    return (
      <MakeItFitSection heading={t('fittings.improve.section.fixFirst')}>
        <p className="text-sm">{t('fittings.improve.fixFirst')}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {state.resources.map((resource) => (
            <button
              key={resource}
              type="button"
              className={textActionClassName()}
              onClick={() => onFixFirst(resource)}
            >
              {t(`fittings.makeItFit.fix.${resource}`)}
            </button>
          ))}
        </div>
      </MakeItFitSection>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div
          role="group"
          aria-label={t('fittings.improve.goalLabel')}
          className="flex flex-wrap gap-2"
        >
          {IMPROVE_GOALS.map((id) => {
            const availability = before ? goalAvailability(id, before, hull) : { available: true };
            const reason =
              'reason' in availability
                ? t(`fittings.improve.unavailable.${availability.reason}`)
                : undefined;
            return (
              <FilterChip
                key={id}
                label={t(`fittings.improve.goal.${id}`)}
                selected={goal === id}
                disabled={!availability.available}
                {...(reason ? { tooltip: reason } : {})}
                onToggle={() => {
                  if (goal === id) return;
                  setTicked(new Map());
                  onGoalChange(id);
                }}
              />
            );
          })}
        </div>
        <p className="text-text-dim text-xs">
          {t(
            goal === 'cheaper'
              ? 'fittings.improve.guardrail.cheaper'
              : 'fittings.improve.guardrail.combat'
          )}
        </p>
        {goal === 'mining' && (
          <div className="space-y-1 text-sm">
            <span aria-hidden="true">{t('fittings.improve.oreLabel')}</span>
            <Select value={settings.oreFamily} onValueChange={settings.onOreFamilyChange}>
              <SelectTrigger aria-label={t('fittings.improve.oreLabel')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CRYSTAL_FAMILY_ORES).map(([family, ores]) => (
                  <SelectItem key={family} value={family}>
                    {t('fittings.improve.oreOption', { ores: ores.join(', '), family })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-text-dim text-xs">{t('fittings.improve.oreHint')}</p>
          </div>
        )}
        {goal === 'haul' && before && (
          <div className="space-y-1 text-sm">
            <span aria-hidden="true">{t('fittings.improve.holdLabel')}</span>
            <Select
              value={effectiveHold(before.holds, settings.hold)}
              onValueChange={(value) => settings.onHoldChange(value as ImproveHold)}
            >
              <SelectTrigger aria-label={t('fittings.improve.holdLabel')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPROVE_HOLDS.filter((hold) => before.holds[hold] > 0).map((hold) => (
                  <SelectItem key={hold} value={hold}>
                    {t('fittings.improve.holdOption', {
                      hold: t(`fittings.improve.hold.${hold}`),
                      size: m3Format(before.holds[hold]),
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-text-dim text-xs">{t('fittings.improve.holdHint')}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SegmentedControl
          label={t('fittings.improve.reachLabel')}
          options={IMPROVE_REACHES.map((value) => ({
            value,
            label: t(`fittings.improve.reach.${value}`),
          }))}
          value={settings.reach}
          onChange={settings.onReachChange}
          fill
        />
        <p className="text-text-dim text-xs">{t(`fittings.improve.reachHint.${settings.reach}`)}</p>
        <SegmentedControl
          label={t('fittings.improve.modeLabel')}
          options={IMPROVE_MODES.map((value) => ({
            value,
            label: t(`fittings.improve.mode.${value}`),
          }))}
          value={settings.mode}
          onChange={settings.onModeChange}
          fill
        />
        <label className="block space-y-1 text-sm">
          <span>{t(`fittings.improve.cap.${settings.mode}`)}</span>
          <IskInput
            value={settings.spendCap === null ? '' : String(settings.spendCap)}
            onChange={(value) => settings.onSpendCapChange(value === '' ? null : Number(value))}
          />
        </label>
        {TANK_GOALS.has(goal) && (
          <>
            <SegmentedControl
              label={t('fittings.improve.defenseLabel')}
              options={DEFENSE_CHOICES.map((value) => ({
                value,
                label: t(`fittings.improve.defense.${value}`),
                // Upgrade swaps a module within its own type, so it can't change tank side.
                ...(value !== 'keep' && settings.reach === 'upgrade'
                  ? { disabled: true, disabledReason: t('fittings.improve.defenseUpgrade') }
                  : {}),
              }))}
              value={settings.defense}
              onChange={settings.onDefenseChange}
              fill
            />
            {settings.reach === 'upgrade' && (
              <p className="text-text-dim text-xs">{t('fittings.improve.defenseUpgrade')}</p>
            )}
          </>
        )}
        <div>
          <button
            type="button"
            className={textActionClassName()}
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {t('fittings.improve.moreLabel')}
          </button>
          <Collapse open={moreOpen} id={moreId} className="pt-2">
            <div className="space-y-1">
              <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                <Checkbox
                  checked={settings.includeRigs}
                  onChange={(event) => settings.onIncludeRigsChange(event.target.checked)}
                />
                {t('fittings.improve.includeRigs')}
              </label>
              <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                <Checkbox
                  checked={settings.includeOfficer}
                  onChange={(event) => settings.onIncludeOfficerChange(event.target.checked)}
                />
                {t('fittings.improve.includeOfficer')}
              </label>
            </div>
          </Collapse>
        </div>
      </div>

      {unloaded && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t(`fittings.improve.unloaded.${unloaded.kind}`, { count: unloaded.count })}
          </p>
          {onLoadBestCharge && (
            <Button size="sm" onClick={onLoadBestCharge}>
              {t('fittings.improve.loadBestCharge')}
            </Button>
          )}
        </div>
      )}

      {state.status === 'searching' && (
        <div className="space-y-2">
          <p className="text-text-dim flex items-center gap-2 text-sm">
            <Spinner />
            {t('fittings.improve.checking', { checked: state.checked, total: state.total })}
          </p>
          <ProgressBar
            label={t('fittings.improve.progressLabel')}
            value={state.total > 0 ? state.checked : null}
            max={Math.max(1, state.total)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={search.cancel}>
              {t('fittings.improve.cancel')}
            </Button>
            {state.slow && (
              <Button size="sm" onClick={search.showBestSoFar}>
                {t('fittings.improve.bestSoFar')}
              </Button>
            )}
          </div>
        </div>
      )}

      {state.status === 'cancelled' && (
        <div className="space-y-2">
          <p className="text-text-dim text-sm">{t('fittings.improve.cancelled')}</p>
          <Button size="sm" onClick={search.restart}>
            {t('fittings.improve.searchAgain')}
          </Button>
        </div>
      )}

      {state.status === 'belowPrice' && (
        <p className="text-warning text-sm" data-testid="improve-below-price">
          {t('fittings.improve.belowPrice', {
            budget: formatIskCompact(state.budget),
            price: formatIskCompact(state.fitTotal),
          })}
        </p>
      )}

      {state.status === 'failed' && (
        <p className="text-danger text-sm">{t('fittings.improve.failed')}</p>
      )}

      {freeSections}

      {state.status === 'done' && state.sides && (
        <p className="text-sm" data-testid="improve-sides">
          {(['shield', 'armor'] as const)
            .map((side) => {
              const score = bestScore(state.sides![side]);
              return t('fittings.improve.sideResult', {
                side: t(`fittings.improve.defense.${side}`),
                result:
                  score === null
                    ? t('fittings.improve.sideNone')
                    : t('fittings.improve.sideGain', { percent: Math.round(score * 100) }),
              });
            })
            .join(' · ')}
        </p>
      )}

      {state.status === 'done' &&
        (state.result.noDownside.length === 0 && state.result.tradeOffs.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm">
              {t(
                noModules
                  ? 'fittings.improve.nothing.noModules'
                  : `fittings.improve.nothing.${goal}`
              )}
            </p>
            {state.result.stopped && (
              <div className="space-y-2">
                <p className="text-text-dim text-xs">
                  {t('fittings.improve.partial', { checked: state.result.checked })}
                </p>
                <Button size="sm" onClick={search.restart}>
                  {t('fittings.improve.searchAgain')}
                </Button>
              </div>
            )}
            {state.result.rejected.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.closest')}>
                <ul className="space-y-1">
                  {state.result.rejected.map((option) => {
                    const line = moveLine(option, state.before);
                    return (
                      <li
                        key={optionKey(option)}
                        className="border-line rounded-xs border p-2 text-sm"
                      >
                        <p className="font-medium">{swapLabel(option)}</p>
                        {goal === 'mining' && (
                          <p className="text-xs">{oreLine(option, state.before)}</p>
                        )}
                        {line && <p className="text-xs">{line}</p>}
                        <p className="text-text-dim text-xs">{changeLine(option, state.before)}</p>
                        <p className="text-warning text-xs">
                          {brokeText(t, option, settings, state.fitTotal)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </MakeItFitSection>
            )}
            {!noModules && (
              <p className="text-text-dim text-xs">
                {t(`fittings.improve.widen.${settings.reach}`)}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {state.result.stopped && (
              <p className="text-text-dim text-xs">
                {t('fittings.improve.partial', { checked: state.result.checked })}
              </p>
            )}
            <SegmentedControl
              label={t('fittings.improve.sortLabel')}
              options={IMPROVE_SORTS.map((value) => ({
                value,
                label: t(`fittings.improve.sort.${value}`),
              }))}
              value={sort}
              onChange={setSort}
              fill
            />
            {state.result.noDownside.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.section.noDownside')}>
                {rows(state.result.noDownside, state.before, 'nd')}
              </MakeItFitSection>
            )}
            {state.result.tradeOffs.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.section.tradeOffs')}>
                {rows(state.result.tradeOffs, state.before, 'to')}
              </MakeItFitSection>
            )}
            <div className="bg-surface border-line sticky bottom-0 space-y-2 border-t pt-2">
              {chosen.length > 0 && checkable && (
                <div className="space-y-1 text-sm" data-testid="improve-selection">
                  {summary ? (
                    <>
                      <p>
                        {t('fittings.improve.selection.changes', { count: summary.count })}
                        {' · '}
                        {settings.mode === 'buy' && summary.total !== null ? (
                          <>
                            {t('fittings.improve.selection.total')}{' '}
                            <IskAmount value={summary.total} />
                          </>
                        ) : (
                          <>
                            {summary.isk < 0
                              ? t('fittings.makeItFit.saves')
                              : t('fittings.makeItFit.costs')}{' '}
                            <IskAmount value={Math.abs(summary.isk)} />
                          </>
                        )}
                        {summary.unpriced > 0 &&
                          ` + ${t('fittings.improve.selection.unpriced', { count: summary.unpriced })}`}
                        {' · '}
                        {t('fittings.improve.selection.dps', {
                          before: m3sFormat(summary.dps.before),
                          after: m3sFormat(summary.dps.after),
                        })}
                        {' · '}
                        {t('fittings.improve.selection.ehp', {
                          before: m3Format(summary.ehp.before),
                          after: m3Format(summary.ehp.after),
                        })}
                      </p>
                      {summary.problems.map((problem) => (
                        <p
                          key={problem.kind === 'over' ? problem.resource : problem.kind}
                          role="alert"
                          className="text-danger text-xs"
                        >
                          {t(`fittings.improve.selection.problem.${problem.kind}`, {
                            resource:
                              problem.kind === 'over'
                                ? t(`fittings.improve.selection.resource.${problem.resource}`)
                                : undefined,
                          })}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p className="text-text-dim text-xs" role="status">
                      {checked === null
                        ? t('fittings.improve.selection.failed')
                        : t('fittings.improve.selection.checking')}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-text-dim text-xs" data-testid="improve-timing">
                  {t('fittings.improve.checked', {
                    count: state.result.checked,
                    seconds: (state.elapsedMs / 1000).toFixed(1),
                  })}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canApply}
                  onClick={() => {
                    onApply(chosen);
                    setTicked(new Map());
                  }}
                >
                  {chosen.length === 0
                    ? t('fittings.improve.apply')
                    : t('fittings.improve.applyCount', { count: chosen.length })}
                </Button>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
