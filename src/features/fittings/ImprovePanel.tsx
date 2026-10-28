/**
 * Improve's drawer body (scope decision `20261024-171917`): the Improve Goal
 * chips (a goal the fit cannot score is a disabled chip with its reason),
 * the goal's Guardrails as one plain line, then the search — progress with
 * Cancel, "Show best so far" after 10 s — and its results in two sections,
 * No downside and Trade-offs, never ranked against each other. Ticked rows
 * are applied together as one unsaved edit.
 */
import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  StatChangeList,
  TypeIcon,
} from '@/components/ui';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import { commandOf } from '@/engine/fittings/improveCommand';
import { ImproveSkillsSlotContext } from './improveSkillsSlot';
import { hullRoleOf, roleUnlocks } from '@/engine/fittings/improveRole';
import { ewarOf, tackleOf } from '@/engine/fittings/improveTackle';
import { Collapse } from '@/components/ui/Collapse';
import { textActionClassName } from '@/components/ui/textActionClassName';
import {
  applyImproveCandidate,
  overSpendCap,
  bestScore,
  damageOf,
  DEFENSE_CHOICES,
  goalAvailability,
  effectiveHold,
  remoteRepairOf,
  COMBAT_GOALS,
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
import { crystalParts } from '@/engine/fittings/improveMining';
import { overageOf, RESOURCES, type Resource } from '@/engine/fittings/makeItFit';
import { formatIskCompact } from '@/lib/isk';
import { createNumberFormat } from '@/lib/numberLocale';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import {
  capacitorChange,
  diffFittingStats,
  type FittingStatsDelta,
  type StatChangeKey,
} from '@/engine/fittings/variationDelta';
import {
  overallTerms,
  roleChanges,
  type GainMetric,
  type RoleMetric,
} from '@/engine/fittings/skillGains';
import { ADD_PREVIEW_DELAY_MS } from './useModuleAddPreview';
import { groupByModule, IMPROVE_SORTS, type ImproveSort } from '@/engine/fittings/improveRows';
import { findCompletions, mergeCandidates } from '@/engine/fittings/improveComplete';
import { summariseSelection, type SelectionSummary } from '@/engine/fittings/improveSelection';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { MakeItFitSection } from './MakeItFitSection';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { ImproveSearch } from './useImprove';

/** How many stat changes a row spells out before counting the rest. */
const CHANGES_SHOWN = 4;

/** How many overrun fixes get an implant search: each runs the Implant Finder whole. */
const FLYABLE_IMPLANT_FIXES = 3;

/** How long a set must sit over budget before its covering swaps are searched: ticking several rows in a row searches once. */
const COMPLETION_DELAY_MS = 400;

const m3sFormat = createNumberFormat({ maximumFractionDigits: 1 });
const m3Format = createNumberFormat({ maximumFractionDigits: 0 });
const twoDecimals = createNumberFormat({ maximumFractionDigits: 2 });

/** The furthest a turret's optimal, a missile's or area weapon's range reaches, in km. */
const reachKm = (s: FittingStats) =>
  Math.max(
    0,
    ...s.applied.weapons.map((w) =>
      w.kind === 'turret' ? w.optimal : w.kind === 'missile' || w.kind === 'area' ? w.range : 0
    )
  ) / 1000;

/** What a row leads with: the figure, and the detail-line stats it already shows. */
interface Lead {
  node: ReactNode;
  keys: string[];
  /** When the figure is a plain stat change, so a row of several lines them up as a list. */
  change?: { key: StatChangeKey; before: number; after: number };
}

/** How many figures Best overall's lead line shows: the two that moved the score most. */
const OVERALL_LEAD_FIGURES = 2;

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
  /** The implant alternative under a Make Flyable fix that overran CPU or powergrid; absent: none. */
  renderFlyableImplants?: (fix: RejectedOption, label: string) => ReactNode;
  settings: ImproveSettings;
  /** Opens Make it fit on that budget, from "Fix this first". */
  onFixFirst: (resource: Resource) => void;
  /** Weapons holding no charge, which damage goals can't score; null or absent: none. */
  unloaded?: UnloadedWeapons | null;
  /** Loads Mine more's best crystal into the miners that hold none of the ore's; absent when it cannot. */
  onLoadBestCrystal?: () => void;
  /** Loads the best charge into each empty weapon group; absent when none can be loaded. */
  onLoadBestCharge?: () => void;
  /** Train and Implants, which cost the fit nothing and sit above the swaps; none for an over-budget fit. */
  freeSections?: ReactNode;
  /** The open Fitting, to check the ticked rows together; absent: no combined check. */
  fitting?: Fitting | null;
  /** The page's Target Profile, for the summary's DPS. */
  target?: TargetProfile;
  /**
   * Tells the stats column what the ticked rows, plus the row under the
   * pointer or keyboard focus, would change; null when nothing is previewed.
   */
  onPreview?: (delta: FittingStatsDelta | null, iskDelta?: number | null) => void;
  /** The drawer's footer, where the selection and Apply bar goes; absent: it sticks to the list's bottom. */
  footerTarget?: HTMLElement | null;
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

/** Goals the fit itself decides: they only matter once it has the modules, whatever the hull. */
const FIT_DERIVED_GOALS: readonly ImproveGoal[] = [
  'mining',
  'repair',
  'transfer',
  'tackle',
  'ewar',
  'command',
];

const NO_TICKS: ReadonlyMap<string, ImproveOption> = new Map();
const NO_OPEN: ReadonlySet<string> = new Set();

export function ImprovePanel({
  goal,
  onGoalChange,
  search,
  catalogue,
  onApply,
  renderFlyableImplants,
  settings,
  onFixFirst,
  unloaded,
  onLoadBestCrystal,
  onLoadBestCharge,
  freeSections,
  fitting,
  target,
  onPreview,
  footerTarget,
}: Props) {
  const { t } = useTranslation();
  const moreId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const settingsId = useId();
  // Search settings and Skills share one expansion area: opening one shuts the other.
  const [openPanel, setOpenPanel] = useState<'settings' | 'skills' | null>(null);
  const settingsOpen = openPanel === 'settings';
  const togglePanel = (panel: 'settings' | 'skills') =>
    setOpenPanel((current) => (current === panel ? null : panel));
  const skillsId = useId();
  // A new Goal may have nothing to train: don't leave an empty Skills panel open.
  const [panelGoal, setPanelGoal] = useState(goal);
  if (panelGoal !== goal) {
    setPanelGoal(goal);
    if (openPanel === 'skills') setOpenPanel(null);
  }
  const [skillsTrigger, setSkillsTrigger] = useState<HTMLElement | null>(null);
  const [skillsPanel, setSkillsPanel] = useState<HTMLElement | null>(null);
  const goalsId = useId();
  const [goalsOpen, setGoalsOpen] = useState(false);
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
  // The row under the pointer or keyboard focus; like ticks, it belongs to the result it was made in.
  const [hovering, setHovering] = useState<{
    result: ImproveResult | null;
    option: ImproveOption | null;
  }>({ result: null, option: null });
  const hovered = hovering.result === result ? hovering.option : null;
  const setHover = (option: ImproveOption | null) => setHovering({ result, option });
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
  /** The swaps chained behind a Make Flyable fix, each named: what frees the CPU or powergrid it takes. */
  const flyableSwaps = (candidate: ImproveOption['candidate']): string[] =>
    candidate.pairedWith
      ? [moveLabel(candidate.pairedWith), ...flyableSwaps(candidate.pairedWith)]
      : [];

  const swapLabel = (option: ImproveOption) =>
    option.candidate.fixesUnflyable
      ? moveLabel({ ...option.candidate, pairedWith: undefined })
      : option.candidate.pairedWith
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
    onOpen?: () => void,
    omit: readonly string[] = []
  ): ReactNode {
    // What the swap does first; the CPU, powergrid and calibration it takes after.
    const changes = diffFittingStats(own, option.after)
      .changes.filter((change) => !omit.includes(change.key))
      .sort((a, b) => Number(isResource(a.key)) - Number(isResource(b.key)));
    if (changes.length === 0) return t('fittings.variations.noChanges');
    // One stat per row, so a long list reads down instead of running on as a sentence.
    const shown = changes.slice(0, all ? undefined : CHANGES_SHOWN);
    const rest = changes.length - shown.length;
    const label = rest > 0 ? t('fittings.makeItFit.otherStats', { count: rest }) : null;
    return (
      <>
        <StatChangeList changes={shown} />
        {label !== null &&
          (onOpen ? (
            <button type="button" className={textActionClassName()} onClick={onOpen}>
              {label}
            </button>
          ) : (
            <span className="block">{label}</span>
          ))}
      </>
    );
  }

  /** Each stat the swap makes worse, with its before → after, so the loss has a size: one per row. */
  function lostLine(option: ImproveOption): ReactNode {
    const stats = option.lost.flatMap((lost) => (lost.kind === 'stat' ? [lost.change] : []));
    return (
      <>
        {stats.length > 0 && <StatChangeList changes={stats} />}
        {option.lost.map((lost) =>
          lost.kind === 'stat' ? null : (
            <span key={lost.change.key} className="block">
              {t(`fittings.whatToTrain.role.${lost.change.key}`, {
                before: lost.change.before,
                after: lost.change.after,
              })}
            </span>
          )
        )}
      </>
    );
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
    return t('fittings.improve.oreLine', {
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

  /**
   * The goal's own figure, before → after, first on every row. `keys` are the
   * detail-line stats it already shows, so the row does not say them twice.
   */
  function leadLine(option: ImproveOption, own: FittingStats): Lead | null {
    const stat = (key: StatChangeKey, before: number, after: number): Lead => ({
      node: <StatChange key={key} change={{ key, before, after }} />,
      keys: [key],
      change: { key, before, after },
    });
    const text = (key: string, line: string | null): Lead | null =>
      line === null ? null : { node: <span key={key}>{line}</span>, keys: [] };
    const dps = (): Lead => {
      const [was, now] = [damageOf(own, target), damageOf(option.after, target)];
      // A damage figure is labelled for what it is: applied to the Target Profile, or the fit's listed sustained DPS.
      if (target && own.applied.weapons.length > 0) return stat('appliedDps', was, now);
      return stat('sustainedDps', was, now);
    };
    const tank = () => stat('ehp', own.ehp, option.after.ehp);
    const role = (metric: RoleMetric): Lead | null => {
      const change = roleChanges(own, option.after).find((c) => c.key === metric);
      return change
        ? {
            node: (
              <span key={metric}>
                {t(`fittings.whatToTrain.role.${metric}`, {
                  before: change.before,
                  after: change.after,
                })}
              </span>
            ),
            keys: [],
          }
        : null;
    };
    // One figure that earned Best overall's score, worded as the row's other lines word it.
    const term = (metric: GainMetric): Lead | null => {
      switch (metric) {
        case 'dps':
          return dps();
        case 'ehp':
          return tank();
        case 'activeTank': {
          const total = (s: FittingStats) => s.repair.shield + s.repair.armor + s.repair.hull;
          return text(
            metric,
            t('fittings.improve.activeTankLine', {
              before: m3sFormat(total(own)),
              after: m3sFormat(total(option.after)),
            })
          );
        }
        case 'speed':
          return stat(
            'maxVelocity',
            own.navigation.maxVelocity,
            option.after.navigation.maxVelocity
          );
        case 'align':
          return text(
            metric,
            t('fittings.improve.alignLine', {
              before: twoDecimals(alignOf(own)),
              after: twoDecimals(alignOf(option.after)),
            })
          );
        case 'capacitor': {
          const change = capacitorChange(own, option.after);
          return change && stat('capacitor', change.before, change.after);
        }
        case 'lockRange':
          return stat(
            'maxTargetRange',
            own.targeting.maxTargetRange / 1000,
            option.after.targeting.maxTargetRange / 1000
          );
        default:
          return role(metric);
      }
    };
    switch (goal) {
      case 'damage':
        return dps();
      case 'tank':
        return tank();
      case 'overall': {
        // The figures that moved the score most, never one that stood still.
        const leads = overallTerms(own, option.after)
          .map(({ metric }) => term(metric))
          .filter((lead): lead is Lead => lead !== null)
          .slice(0, OVERALL_LEAD_FIGURES);
        return leads.length === 0
          ? null
          : {
              // A line each, like the change rows below them: the plain stat
              // changes as one list, any worded figure on its own line after.
              node: (
                <>
                  <StatChangeList
                    changes={leads.flatMap((lead) => (lead.change ? [lead.change] : []))}
                  />
                  {leads
                    .filter((lead) => !lead.change)
                    .map((lead) => (
                      <span key={lead.keys.join() || String(lead.node)} className="block">
                        {lead.node}
                      </span>
                    ))}
                </>
              ),
              keys: leads.flatMap((lead) => lead.keys),
            };
      }
      case 'speed':
        return stat('maxVelocity', own.navigation.maxVelocity, option.after.navigation.maxVelocity);
      case 'reach':
        return text(
          goal,
          t('fittings.improve.reachLine', {
            before: m3sFormat(reachKm(own)),
            after: m3sFormat(reachKm(option.after)),
          })
        );
      case 'mining':
        return text(goal, oreLine(option, own));
      default:
        return text(goal, moveLine(option, own));
    }
  }

  /** The goal's figure now → after the single best swap; null when there is no result or the goal has no figure. */
  function bestFoundLine(result: ImproveResult, own: FittingStats): ReactNode {
    const best = [...result.noDownside, ...result.tradeOffs].reduce<ImproveOption | null>(
      (top, option) => (top === null || option.score > top.score ? option : top),
      null
    );
    return best === null ? null : (leadLine(best, own)?.node ?? null);
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
      <li
        key={optionKey(option)}
        className="border-line rounded-xs border p-2 text-sm"
        // A mouse hover or a keyboard focus previews it; touch has no hover, so only its tick does (§6c).
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(option)}
        // Leaving with the pointer keeps a keyboard-focused row previewed; moving focus between the row's own parts keeps it too.
        onPointerLeave={(event) =>
          !event.currentTarget.contains(
            document.activeElement?.matches(':focus-visible') ? document.activeElement : null
          ) && setHover(null)
        }
        onFocus={(event) => event.target.matches(':focus-visible') && setHover(option)}
        onBlur={(event) =>
          !event.currentTarget.contains(event.relatedTarget as Node | null) && setHover(null)
        }
      >
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
              {goal !== 'cheaper' && !option.candidate.fixesUnflyable && (
                <span className="text-success shrink-0 text-xs font-medium">
                  {t('fittings.improve.gain', { percent: m3sFormat(option.score * 100) })}
                </span>
              )}
            </span>
            {option.candidate.fixesUnflyable && (
              <span className="text-warning block text-xs">{t('fittings.improve.unflyable')}</span>
            )}
            {option.candidate.fixesUnflyable && option.candidate.pairedWith && (
              <span className="block text-xs">
                {t('fittings.improve.flyableWith', {
                  swaps: flyableSwaps(option.candidate).join('; '),
                })}
              </span>
            )}
            {lead && <span className="block text-xs">{lead.node}</span>}
            <span className="text-text-dim block text-xs">
              {changeLine(option, own, expanded.has(statsKey), () => flip(statsKey), lead?.keys)}
            </span>
            {option.lost.length > 0 && (
              <span className="text-warning block text-xs">
                <span className="block">{t('fittings.improve.givesUp')}</span>
                {lostLine(option)}
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

  /** A fix that cannot be applied as it stands: greyed, with what it needs and why nothing covers it. */
  function blockedRow(
    option: RejectedOption,
    own: FittingStats,
    fitTotal: number | null,
    searched: boolean
  ) {
    const short = RESOURCES.filter((resource) => overageOf(option.after, resource) > 0).map(
      (resource) =>
        t('fittings.improve.flyableShort', {
          amount: m3sFormat(overageOf(option.after, resource)),
          resource: t(`fittings.improve.resource.${resource}`),
        })
    );
    return (
      <li
        key={optionKey(option)}
        className="border-line text-text-dim rounded-xs border p-2 text-sm"
        data-testid="improve-flyable-blocked"
      >
        <span className="flex items-start gap-2">
          <TypeIcon typeId={option.candidate.toTypeId} size={32} width={24} height={24} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{swapLabel(option)}</span>
            <span className="block text-xs">{t('fittings.improve.unflyable')}</span>
            <span className="text-warning block text-xs">
              {option.guardrail === 'budget' && searched
                ? t('fittings.improve.flyableNoCover', { short: short.join(', ') })
                : brokeText(t, option, settings, fitTotal)}
            </span>
            <span className="block text-xs">{changeLine(option, own)}</span>
          </span>
        </span>
      </li>
    );
  }

  // Mine more's rows compare on the best crystals; "Now" is the fit as it is.
  const bestFound =
    state.status === 'done' ? bestFoundLine(state.result, state.fitAsIs ?? state.before) : null;
  const crystalBasis = state.status === 'done' ? state.crystals : undefined;
  const unloadedCrystals = crystalBasis?.unloaded ?? null;
  const unloadedNow = state.status === 'done' ? (state.fitAsIs?.mining.perSecond ?? 0) : 0;
  const unloadedBest = state.status === 'done' ? state.before.mining.perSecond : 0;
  // Said only when "Now" and the rows are on different crystals.
  const basisDiffers = crystalBasis !== undefined && unloadedNow !== unloadedBest;
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
  // The ticked rows were each checked alone; together they can overrun, and the pilot is then offered what covers it.
  const overruns = summary?.problems.some((problem) => problem.kind === 'over') ?? false;
  const completion = search.completion;
  const [covers, setCovers] = useState<{ key: string; options: ImproveOption[] } | null>(null);
  useEffect(() => {
    if (!fitting || !recalc || !completion || !checked || !overruns || chosen.length === 0) return;
    let stale = false;
    const timer = setTimeout(() => {
      void (async () => {
        const taken = new Set(chosen.flatMap((pick) => slotsOf(pick.candidate)));
        const pool = await completion();
        const options = await findCompletions({
          fitting: chosen.reduce(
            (acc, pick) => applyImproveCandidate(acc, pick.candidate),
            fitting
          ),
          before: checked,
          swaps: pool.swaps.filter((swap) => !taken.has(`${swap.slot}${swap.slotIndex}`)),
          stats: recalc,
          priceOf: pool.priceOf,
          mode: settings.mode,
          isCancelled: () => stale,
        });
        if (!stale) setCovers({ key: chosenKey, options });
      })().catch(() => !stale && setCovers({ key: chosenKey, options: [] }));
    }, COMPLETION_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
    // `settings.mode` is part of the price a cover shows.
  }, [fitting, recalc, completion, checked, overruns, chosen, chosenKey, settings.mode]);
  // Ticked rows that no list shows are covers added from the footer: they get a tick of their own there.
  const listedKeys = useMemo(
    () =>
      state.status === 'done'
        ? new Set(
            [
              ...state.result.makeFlyable,
              ...state.result.noDownside,
              ...state.result.tradeOffs,
            ].map(optionKey)
          )
        : new Set<string>(),
    [state]
  );
  const tickedCovers = chosen.filter((pick) => !listedKeys.has(optionKey(pick)));
  const offered =
    covers?.key === chosenKey && summary
      ? covers.options.filter(
          (option) =>
            !overSpendCap(
              settings.mode,
              settings.spendCap,
              state.status === 'done' ? state.fitTotal : null,
              summary.isk + (option.iskDelta ?? 0)
            )
        )
      : null;
  // The set as one change with its overrun, for the implant alternative; stable so the finder is not re-run each render.
  const setAsFix = useMemo<RejectedOption | null>(() => {
    const candidate = mergeCandidates(chosen.map((pick) => pick.candidate));
    if (!fitting || !checked || !candidate || !summary || !overruns) return null;
    return {
      candidate,
      fitting: chosen.reduce((acc, pick) => applyImproveCandidate(acc, pick.candidate), fitting),
      after: checked,
      score: 0,
      iskDelta: summary.isk,
      destroysRigs: false,
      lost: [],
      guardrail: 'budget',
    };
    // `summary` follows `checked` and `chosen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitting, checked, chosenKey, overruns]);

  // The ticked set with the hovered row on top (it displaces a ticked row sharing a slot, as ticking it would).
  const hoverSet = useMemo(() => {
    if (!hovered || ticked.has(optionKey(hovered))) return null;
    const taken = new Set(slotsOf(hovered.candidate));
    return [
      ...chosen.filter((pick) => !slotsOf(pick.candidate).some((slot) => taken.has(slot))),
      hovered,
    ];
  }, [hovered, ticked, chosen]);
  const hoverKey = hoverSet?.map(optionKey).sort().join('|') ?? null;
  const [hoverResult, setHoverResult] = useState<{
    key: string;
    fitting: Fitting;
    after: FittingStats | null;
  } | null>(null);
  // One debounced recalculation per hovered row, so a sweep down the list works out only where the pointer rests.
  useEffect(() => {
    if (!fitting || !recalc || !hoverSet || hoverKey === null) return;
    let stale = false;
    const timer = setTimeout(() => {
      const folded = hoverSet.reduce(
        (acc, pick) => applyImproveCandidate(acc, pick.candidate),
        fitting
      );
      recalc(folded)
        .then((after) => !stale && setHoverResult({ key: hoverKey, fitting, after }))
        .catch(() => !stale && setHoverResult({ key: hoverKey, fitting, after: null }));
    }, ADD_PREVIEW_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [fitting, recalc, hoverSet, hoverKey]);
  const hoverAfter =
    hoverKey !== null && hoverResult?.key === hoverKey && hoverResult.fitting === fitting
      ? hoverResult.after
      : null;
  // Until the hovered row's figures land, the ticked set's stay up.
  const previewAfter = hoverAfter ?? (chosen.length > 0 ? (checked ?? null) : null);
  const previewBefore = state.status === 'done' ? state.before : null;
  const previewDelta = useMemo(
    () => (previewBefore && previewAfter ? diffFittingStats(previewBefore, previewAfter) : null),
    [previewBefore, previewAfter]
  );
  // The Price figure follows the same rows. Only buy mode moves the fit's price by exactly the rows' iskDelta.
  const previewRows = hoverAfter && hoverSet ? hoverSet : chosen;
  const previewIsk =
    settings.mode === 'buy' && previewDelta && previewRows.some((row) => row.iskDelta !== null)
      ? previewRows.reduce((sum, row) => sum + (row.iskDelta ?? 0), 0)
      : null;
  useEffect(() => {
    onPreview?.(previewDelta, previewIsk);
  }, [onPreview, previewDelta, previewIsk]);
  // Closing Improve (or a new search) takes the panel away: nothing stays previewed.
  useEffect(() => () => onPreview?.(null), [onPreview]);
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

  const role = hullRoleOf(hull);
  const availabilityOf = (id: ImproveGoal) =>
    before ? goalAvailability(id, before, hull) : { available: true as const };
  const unavailableReason = (id: ImproveGoal): string | undefined => {
    const availability = availabilityOf(id);
    return 'reason' in availability
      ? t(`fittings.improve.unavailable.${availability.reason}`)
      : undefined;
  };
  // Role-relevant goals lead as chips; the rest, and any the fit cannot score, sit under "More goals".
  const roleGoals: readonly ImproveGoal[] = role === 'combat' ? COMBAT_GOALS : roleUnlocks(role);
  // The picked goal stays a chip so the pick is visible, unless the fit cannot score it: that one sits with its reason.
  const isRelevant = (id: ImproveGoal) =>
    availabilityOf(id).available &&
    (id === goal || roleGoals.includes(id) || FIT_DERIVED_GOALS.includes(id));
  const relevantGoals = IMPROVE_GOALS.filter(isRelevant);
  const otherGoals = IMPROVE_GOALS.filter((id) => !isRelevant(id));
  const settingsSummary = [
    t(`fittings.improve.reach.${settings.reach}`),
    t(`fittings.improve.mode.${settings.mode}`),
    settings.spendCap === null
      ? t('fittings.improve.summaryNoCap')
      : t(`fittings.improve.summaryCap.${settings.mode}`, {
          cap: formatIskCompact(settings.spendCap),
        }),
  ].join(' · ');
  const pickGoal = (id: ImproveGoal) => {
    if (goal === id) return;
    setTicked(new Map());
    onGoalChange(id);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div
          role="group"
          aria-label={t('fittings.improve.goalLabel')}
          className="flex flex-wrap gap-2"
        >
          {relevantGoals.map((id) => (
            <FilterChip
              key={id}
              label={t(`fittings.improve.goal.${id}`)}
              selected={goal === id}
              onToggle={() => pickGoal(id)}
            />
          ))}
          {otherGoals.length > 0 && (
            <FilterChip
              label={t('fittings.improve.more')}
              selected={goalsOpen}
              expanded={goalsOpen}
              controls={goalsId}
              onToggle={() => setGoalsOpen((open) => !open)}
              count={otherGoals.length}
              countLabel={t('fittings.improve.moreCount', { count: otherGoals.length })}
            />
          )}
        </div>
        {otherGoals.length > 0 && (
          <Collapse open={goalsOpen} id={goalsId} className="pt-1">
            <ul>
              {otherGoals.map((id) => {
                const reason = unavailableReason(id);
                return (
                  <li
                    key={id}
                    className="flex flex-col items-start gap-1 py-1 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="sm:w-52 sm:shrink-0">
                      <FilterChip
                        label={t(`fittings.improve.goal.${id}`)}
                        selected={goal === id}
                        disabled={reason !== undefined}
                        onToggle={() => pickGoal(id)}
                      />
                    </span>
                    {reason && <span className="text-warning text-xs">{reason}</span>}
                  </li>
                );
              })}
            </ul>
          </Collapse>
        )}
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

      <div>
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className={textActionClassName('min-w-0 flex-wrap gap-x-1 text-left')}
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            onClick={() => togglePanel('settings')}
          >
            <span>{t('fittings.improve.settingsLabel')}</span>
            <Caret expanded={settingsOpen} />
            <span className="text-text-dim basis-full text-xs normal-case tracking-normal">
              {settingsSummary}
            </span>
          </button>
          <div ref={setSkillsTrigger} className="shrink-0" />
        </div>
        <Collapse open={settingsOpen} id={settingsId} className="pt-2">
          <div className="space-y-3">
            <p className="text-text-dim text-xs">
              {t(
                goal === 'cheaper'
                  ? 'fittings.improve.guardrail.cheaper'
                  : 'fittings.improve.guardrail.combat'
              )}
            </p>
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
            <p className="text-text-dim text-xs">
              {t(`fittings.improve.reachHint.${settings.reach}`)}
            </p>
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
                className={textActionClassName('gap-1')}
                aria-expanded={moreOpen}
                aria-controls={moreId}
                onClick={() => setMoreOpen((open) => !open)}
              >
                {t('fittings.improve.moreLabel')}
                <Caret expanded={moreOpen} />
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
        </Collapse>
        <Collapse open={openPanel === 'skills'} id={skillsId} className="pt-2">
          <div ref={setSkillsPanel} />
        </Collapse>
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

      {unloadedCrystals && (
        <div className="space-y-2">
          <p role="status" className="text-warning text-sm">
            {t('fittings.improve.unloadedCrystals', {
              count: unloadedCrystals.count,
              family: settings.oreFamily,
              now: m3sFormat(unloadedNow),
              crystal: t('fittings.improve.crystalType', crystalParts(crystalBasis?.bestKey ?? '')),
              best: m3sFormat(unloadedBest),
            })}
          </p>
          {onLoadBestCrystal && (
            <Button size="sm" onClick={onLoadBestCrystal}>
              {t('fittings.improve.loadBestCrystal')}
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

      <ImproveSkillsSlotContext.Provider
        value={{
          trigger: skillsTrigger,
          panel: skillsPanel,
          open: openPanel === 'skills',
          onToggle: () => togglePanel('skills'),
          panelId: skillsId,
        }}
      >
        {freeSections}
      </ImproveSkillsSlotContext.Provider>

      {state.status === 'done' && state.sides && (
        <p className="text-sm" data-testid="improve-sides">
          {[
            ...(['shield', 'armor'] as const).map((side) => ({
              label: t(`fittings.improve.defense.${side}`),
              score: bestScore(state.sides![side]),
            })),
            // Neutral rows (Damage Control, hull) help either side; shown only when there are some.
            ...(state.neutral && bestScore(state.neutral) !== null
              ? [{ label: t('fittings.improve.defense.either'), score: bestScore(state.neutral) }]
              : []),
          ]
            .map(({ label, score }) =>
              t('fittings.improve.sideResult', {
                side: label,
                result:
                  score === null
                    ? t('fittings.improve.sideNone')
                    : t('fittings.improve.sideGain', { percent: Math.round(score * 100) }),
              })
            )
            .join(' · ')}
        </p>
      )}

      {state.status === 'done' &&
        (state.result.makeFlyable.length === 0 &&
        state.result.flyableBlocked.length === 0 &&
        state.result.noDownside.length === 0 &&
        state.result.tradeOffs.length === 0 ? (
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
            {bestFound && (
              <p className="text-sm" data-testid="improve-best-found">
                <span className="text-text-dim">{t('fittings.improve.bestFound')} </span>
                <span className="font-medium">{bestFound}</span>
                {basisDiffers && (
                  <span className="text-text-dim">
                    {' '}
                    {t('fittings.improve.bestCrystals', {
                      ores: (CRYSTAL_FAMILY_ORES[settings.oreFamily] ?? []).join(', '),
                    })}
                  </span>
                )}
              </p>
            )}
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
            {(state.result.makeFlyable.length > 0 || state.result.flyableBlocked.length > 0) && (
              <MakeItFitSection heading={t('fittings.improve.section.makeFlyable')}>
                {state.result.makeFlyable.length > 0 &&
                  rows(state.result.makeFlyable, state.before, 'mf')}
                {renderFlyableImplants &&
                  state.result.flyableOverrun
                    .slice(0, FLYABLE_IMPLANT_FIXES)
                    .map((fix) => (
                      <Fragment key={optionKey(fix)}>
                        {renderFlyableImplants(fix, swapLabel(fix))}
                      </Fragment>
                    ))}
                {state.result.flyableBlocked.length > 0 && (
                  <ul className="space-y-1">
                    {state.result.flyableBlocked.map((option) =>
                      blockedRow(
                        option,
                        state.before,
                        state.fitTotal,
                        state.result.flyableOverrun.includes(option)
                      )
                    )}
                  </ul>
                )}
              </MakeItFitSection>
            )}
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
            <ImproveFooter target={footerTarget}>
              {chosen.length > 0 && checkable && (
                <div
                  className="flex items-end justify-between gap-3 text-sm"
                  data-testid="improve-selection"
                >
                  {summary ? (
                    <>
                      <div className="min-w-0 space-y-1">
                        <p>{t('fittings.improve.selection.changes', { count: summary.count })}</p>
                        <p>
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
                      </div>
                      <SelectionCost
                        summary={summary}
                        buy={settings.mode === 'buy'}
                        spendCap={settings.spendCap}
                      />
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
              {(overruns || tickedCovers.length > 0) && (
                <div className="space-y-1 text-sm" data-testid="improve-cover">
                  {tickedCovers.map((pick) => (
                    <label
                      key={optionKey(pick)}
                      className={cx('flex items-start gap-2 text-xs', tappableRowClassName)}
                    >
                      <Checkbox checked onChange={() => toggle(pick)} />
                      <span>
                        {t('fittings.improve.cover.added', {
                          swaps: [moveLabel(pick.candidate), ...flyableSwaps(pick.candidate)].join(
                            '; '
                          ),
                        })}
                      </span>
                    </label>
                  ))}
                  {!overruns ? null : offered === null ? (
                    <p className="text-text-dim text-xs" role="status">
                      {t('fittings.improve.cover.searching')}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-medium">
                        {offered.length > 0
                          ? t('fittings.improve.cover.title')
                          : covers && covers.options.length > 0
                            ? t('fittings.improve.cover.overBudget')
                            : t('fittings.improve.cover.none')}
                      </p>
                      {offered.map((option) => (
                        <button
                          key={optionKey(option)}
                          type="button"
                          className={cx(
                            'border-line w-full rounded-xs border p-2 text-left text-xs',
                            rowInteractiveClassName,
                            focusRingInsetClassName
                          )}
                          onClick={() => toggle(option)}
                        >
                          <span className="block font-medium">
                            {[moveLabel(option.candidate), ...flyableSwaps(option.candidate)].join(
                              '; '
                            )}
                          </span>
                          <span className="block">{isk(option)}</span>
                          {option.destroysRigs && (
                            <span className="text-warning block">
                              {t('fittings.improve.destroysRig')}
                            </span>
                          )}
                        </button>
                      ))}
                    </>
                  )}
                  {overruns &&
                    setAsFix &&
                    renderFlyableImplants?.(setAsFix, t('fittings.improve.cover.thisSet'))}
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
            </ImproveFooter>
          </div>
        ))}
    </div>
  );
}

/**
 * The ticked set's price: the fit's total cost after (buy mode) with what the
 * ticks add to it, or just that change when there is no total to compare.
 */
function SelectionCost({
  summary,
  buy,
  spendCap,
}: {
  summary: SelectionSummary;
  buy: boolean;
  spendCap: number | null;
}) {
  const { t } = useTranslation();
  const tone =
    summary.isk < 0 ? 'text-success' : summary.isk > 0 ? 'text-warning' : 'text-text-dim';
  const delta =
    summary.isk === 0 ? (
      t('fittings.improve.selection.noChange')
    ) : (
      <>
        {summary.isk < 0 ? '−' : '+'}
        <IskAmount value={Math.abs(summary.isk)} />
      </>
    );
  const total = buy ? summary.total : null;
  return (
    <div className="shrink-0 text-right" data-testid="improve-cost">
      <p className="text-text-dim text-xs">
        {t(
          total !== null
            ? 'fittings.improve.selection.totalCost'
            : 'fittings.improve.selection.costChange'
        )}
      </p>
      <p className="text-base font-semibold">
        {total !== null ? (
          <>
            <IskAmount value={total} />{' '}
            <span className={cx('text-sm font-normal', tone)}>({delta})</span>
          </>
        ) : (
          <span className={tone}>{delta}</span>
        )}
      </p>
      {(summary.unpriced > 0 || (total !== null && spendCap !== null)) && (
        <p className="text-text-dim text-xs">
          {total !== null &&
            spendCap !== null &&
            t('fittings.improve.selection.ofBudget', { cap: formatIskCompact(spendCap) })}
          {total !== null && spendCap !== null && summary.unpriced > 0 && ' · '}
          {summary.unpriced > 0 &&
            `+ ${t('fittings.improve.selection.unpriced', { count: summary.unpriced })}`}
        </p>
      )}
    </div>
  );
}

/**
 * The selection and Apply bar. In the drawer it goes to the container's own
 * footer (`target`), below the scrolling list, so no row ever scrolls under it;
 * on its own (tests, a page with no footer) it sticks to the bottom of the list.
 */
function ImproveFooter({ target, children }: { target?: HTMLElement | null; children: ReactNode }) {
  const bar = <div className="space-y-2">{children}</div>;
  return target ? (
    createPortal(bar, target)
  ) : (
    <div className="bg-panel border-line sticky bottom-0 border-t pt-2">{bar}</div>
  );
}
