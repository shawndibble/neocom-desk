/**
 * Improve's **Makeover**: a whole-fit rework found by chaining swaps (issue
 * #5560, parent #5548, scope decision `20261029-154105-improve-makeover-search`).
 * `findImprovements` scores one module type at a time against the unchanged
 * fit; this search applies the best one-slot move, looks again from the
 * result, and repeats, so linked changes, a split of two copies into two
 * different modules, and a pair where one half only pays off because the other
 * frees CPU or powergrid all show up. Every figure is still a whole-fit
 * recalculation through the injected `stats`, and every step is scored against
 * the original fit, so the objective never drifts round to round.
 *
 * Pure: no DOM, fetch or Dexie.
 */
import type { VariationIndex } from '../market/variations';
import {
  commonPropulsionKind,
  MICRO_JUMP_DRIVE_GROUP,
  propulsionKindOf,
  PROPULSION_GROUP,
  withinTie,
  type JobCommonality,
  type PropulsionKind,
} from './hullCommonality';
import {
  applyImproveCandidate,
  brokenGuardrail,
  DEFAULT_IMPROVE_HOLD,
  EPSILON,
  iskDeltaOf,
  lostStats,
  overIskBudget,
  scoreOf,
  type DefenseChoice,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveHold,
  type ImproveOption,
  type LostStat,
  type ModulePool,
} from './improve';
import { candidateFilter, FILL_RACKS } from './improveCandidateFilter';
import { jobOf } from './improveGroups';
import { propulsionNeedOf, type ImproveJob, type JobSetting } from './improveJob';
import { coveringFreed, freedBy, overrunBy } from './improvePairSeed';
import type { Resource } from './makeItFit';
import { newRuleBreaks } from './ruleBreaks';
import { fitsResourceBudget } from './skillGaps';
import type { TargetProfile } from './targetProfile';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats } from './types';

const TECH_I = 1;
const TECH_II = 2;

export interface MakeoverMoveOptions {
  goal: ImproveGoal;
  defense: DefenseChoice;
  includeRigs: boolean;
  /** The Improve Job and, for Explore, its space: its freed jobs may go, Dangerous keeps tank modules tank modules. Absent: today's guard. */
  jobSetting?: JobSetting;
  /** What the hull's community fits say for the job (#5581): the groups on enough of them join Rework's. Absent: today's. */
  commonality?: JobCommonality | null;
  /** Market-listed, hull and skill checks, and the groups' members. */
  pool: ModulePool;
  /** The hull's slots per rack, to find the empty ones; absent: no fills. */
  slotCounts?: Readonly<Record<FittingSlotKind, number>>;
}

/**
 * The members of a group the Makeover offers for a rack, one tier per group: the Tech II the hull takes
 * and the pilot flies, else its Tech I (rigs: both, for calibration). A type outside the variation index
 * has no variations: it is its group's Tech I.
 */
function tierRepresentatives(
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  pool: ModulePool
): (group: number, slot: FittingSlotKind) => readonly number[] {
  const metaOf = (typeId: number) => index.types[typeId]?.metaGroupId ?? TECH_I;
  const tiers = new Map<string, readonly number[]>();
  return (group, slot) => {
    const key = `${group}:${slot}`;
    let found = tiers.get(key);
    if (!found) {
      const members = pool
        .typeIdsInGroup(group)
        .filter(
          (typeId) =>
            rackOf[String(typeId)] === slot &&
            pool.published(typeId) &&
            (pool.flyable?.(slot, typeId) ?? true)
        );
      const techTwo = members.filter((typeId) => metaOf(typeId) === TECH_II);
      const techOne = members.filter((typeId) => metaOf(typeId) === TECH_I);
      // A rig's Tech II often needs more calibration than the hull has left, so its Tech I is offered too.
      found = techTwo.length === 0 ? techOne : slot === 'rig' ? [...techTwo, ...techOne] : techTwo;
      tiers.set(key, found);
    }
    return found;
  };
}

/**
 * The one-slot moves the Makeover tries on `modules`. One copy stands for
 * identical copies (the first in the rack), so a split costs no more than a
 * whole-type swap. Targets are the module's own group and the goal's Rework
 * groups (`reworkGroups`), one tier per group: Tech II, else Tech I (rigs: both, for calibration). Faction,
 * deadspace and officer steps stay in Improve's Upgrade rows, so the Makeover
 * changes the fit's shape and not its price tier; Reach does not apply (it is
 * always Rework-wide). The first empty slot of each rack takes the same groups.
 *
 * Filters shared with `improveCandidates`: rack, market-listed, `flyable`, a
 * second unique module, the last module doing a job the goal does not score,
 * rigs only when included, and with a chosen Defense side on a tank goal no
 * non-tank module turns into a tank module. Not carried over: replacing a
 * module the pilot cannot fly (Improve's own Make Flyable rows do that) and
 * the Explore resource-rig rule.
 */
export function makeoverMoves(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  { goal, defense, includeRigs, pool, slotCounts, jobSetting, commonality }: MakeoverMoveOptions
): ImproveCandidate[] {
  const filter = candidateFilter(modules, pool.groupOf, {
    goal,
    defense,
    includeRigs,
    jobSetting,
    commonality,
    nameOf: pool.nameOf,
  });
  const groupOf = pool.groupOf;

  const representatives = tierRepresentatives(index, rackOf, pool);

  /** Whether `group` may take a slot whose module (of `fromGroup`, or none) leaves. */
  const allowed = (group: number, fromGroup: number | undefined) =>
    !filter.tankBlocks(group, fromGroup) && !filter.uniqueBlocks(group, fromGroup, 1);

  const moves: ImproveCandidate[] = [];
  // The groups the community fits add come after every move the table's groups make, so a capped search never loses one for them.
  const added: ImproveCandidate[] = [];
  const seen = new Set<string>();
  for (const module of [...modules].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const { slot, slotIndex, typeId: fromTypeId } = module;
    if (!filter.usesRack(slot) || seen.has(`${slot}:${fromTypeId}`)) continue;
    seen.add(`${slot}:${fromTypeId}`);
    const from = groupOf(fromTypeId);
    const offered = new Set<number>([fromTypeId]);
    const offerGroups = (groups: Iterable<number>, into: ImproveCandidate[]) => {
      for (const group of groups) {
        if (filter.losesJob(group, from, 1) || !allowed(group, from)) continue;
        for (const toTypeId of representatives(group, slot)) {
          if (offered.has(toTypeId) || filter.kindBlocks(toTypeId, fromTypeId)) continue;
          offered.add(toTypeId);
          into.push({ fromTypeId, toTypeId, at: [{ slot, slotIndex }] });
        }
      }
    };
    offerGroups(
      new Set([
        ...(from === undefined ? [] : [from]),
        ...filter.goalGroups.filter((group) => !filter.commonGroups.includes(group)),
      ]),
      moves
    );
    offerGroups(filter.commonGroups, added);
  }

  if (slotCounts) {
    for (const slot of FILL_RACKS) {
      if (!filter.usesRack(slot)) continue;
      const free = filter.firstFreeSlot(slot, slotCounts);
      if (free === null) continue;
      const offered = new Set<number>();
      const fillGroups = (groups: readonly number[], into: ImproveCandidate[]) => {
        for (const group of groups) {
          if (!allowed(group, undefined)) continue;
          for (const toTypeId of representatives(group, slot)) {
            if (offered.has(toTypeId)) continue;
            offered.add(toTypeId);
            into.push({ fromTypeId: null, toTypeId, at: [{ slot, slotIndex: free }] });
          }
        }
      };
      fillGroups(
        filter.goalGroups.filter((group) => !filter.commonGroups.includes(group)),
        moves
      );
      fillGroups(filter.commonGroups, added);
    }
  }
  moves.push(...added);
  return moves;
}

/** The propulsion Makeover's forced first step reads: its tiers of moves on a fit, and which types are propulsion. */
export interface PropulsionStart {
  /**
   * The moves that add a propulsion module to `fitting`, in tiers of preference (the first tier
   * with a move that passes the Guardrails wins); none when the fit already has one.
   */
  tiers: (fitting: Fitting) => ImproveCandidate[][];
  /** Whether the type is a propulsion module (any kind). */
  isPropulsion: (typeId: number) => boolean;
  /** The Improve Job whose need it answers, for the row's reason. */
  job: ImproveJob;
}

/**
 * The kinds to add when a fit has no propulsion, in tiers of preference (issue #5578).
 * Explore needs an MWD. PvE takes the kind most of the hull's fits for the job carry
 * (`commonPropulsionKind`: the group, never a variant; the score picks the module); with too
 * little data, a hull that can fit a Large Micro Jump Drive gets one (the engine has no figure
 * for a jump), and any other an afterburner or MWD by score. Where the preferred kind cannot be
 * added, the rules' kinds follow. Empty when the job needs none.
 */
export function propulsionTiers(
  jobSetting: JobSetting | undefined,
  commonality: JobCommonality | null | undefined,
  canFitLargeMjd: boolean
): PropulsionKind[][] {
  const need = propulsionNeedOf(jobSetting);
  if (need === null) return [];
  if (need === 'mwd') return [['mwd']];
  const rules: PropulsionKind[][] = canFitLargeMjd
    ? [['mjd'], ['afterburner', 'mwd']]
    : [['afterburner', 'mwd']];
  const common = commonPropulsionKind(commonality);
  return common ? [[common], ...rules] : rules;
}

/**
 * The forced propulsion step of a Makeover for the job and fit, or null when the job needs none.
 * Its moves put a propulsion module in the medium rack: in place of each distinct module (one copy
 * stands for identical copies) the shared filters allow, and in the first empty slot. The search
 * takes the passing move that costs the least score.
 */
export function propulsionStart(
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  { goal, defense, includeRigs, pool, slotCounts, jobSetting, commonality }: MakeoverMoveOptions
): PropulsionStart | null {
  if (propulsionNeedOf(jobSetting) === null || !jobSetting) return null;
  const nameOf = pool.nameOf;
  const kindOf = (typeId: number) => propulsionKindOf(pool.groupOf(typeId), nameOf?.(typeId));
  const largeMjd = pool
    .typeIdsInGroup(MICRO_JUMP_DRIVE_GROUP)
    .some(
      (typeId) =>
        /^large\b/i.test(nameOf?.(typeId) ?? '') &&
        pool.published(typeId) &&
        (pool.flyable?.('medium', typeId) ?? true)
    );
  const kindTiers = propulsionTiers(jobSetting, commonality, largeMjd);
  const representatives = tierRepresentatives(index, rackOf, pool);
  return {
    job: jobSetting.job,
    isPropulsion: (typeId) => jobOf(pool.groupOf(typeId)) === 'propulsion',
    tiers: (fitting) => {
      if (fitting.modules.some((m) => jobOf(pool.groupOf(m.typeId)) === 'propulsion')) return [];
      const filter = candidateFilter(fitting.modules, pool.groupOf, {
        goal,
        defense,
        includeRigs,
        jobSetting,
        commonality,
        nameOf,
      });
      const mids = [...fitting.modules]
        .filter((m) => m.slot === 'medium')
        .sort((a, b) => a.slotIndex - b.slotIndex);
      const free = slotCounts ? filter.firstFreeSlot('medium', slotCounts) : null;
      return kindTiers.map((kinds) => {
        const targets = [
          ...(kinds.some((kind) => kind === 'afterburner' || kind === 'mwd')
            ? representatives(PROPULSION_GROUP, 'medium')
            : []),
          ...(kinds.includes('mjd') ? representatives(MICRO_JUMP_DRIVE_GROUP, 'medium') : []),
        ].filter((typeId) => kinds.includes(kindOf(typeId) ?? 'afterburner'));
        const moves: ImproveCandidate[] = [];
        const seen = new Set<number>();
        for (const module of mids) {
          if (seen.has(module.typeId)) continue;
          seen.add(module.typeId);
          const from = pool.groupOf(module.typeId);
          for (const toTypeId of targets) {
            const to = pool.groupOf(toTypeId);
            if (
              filter.losesJob(to, from, 1) ||
              filter.tankBlocks(to, from) ||
              filter.uniqueBlocks(to, from, 1)
            )
              continue;
            moves.push({
              fromTypeId: module.typeId,
              toTypeId,
              at: [{ slot: 'medium', slotIndex: module.slotIndex }],
              addsPropulsionFor: jobSetting.job,
            });
          }
        }
        if (free !== null)
          for (const toTypeId of targets)
            moves.push({
              fromTypeId: null,
              toTypeId,
              at: [{ slot: 'medium', slotIndex: free }],
              addsPropulsionFor: jobSetting.job,
            });
        return moves;
      });
    },
  };
}

/**
 * The score a Makeover must beat (`bestSingle`): the best single swap whose
 * modules are all Tech I or Tech II. A faction, deadspace or officer upgrade
 * is a price step the Makeover never makes, and stays a single row the pilot
 * can tick beside it; it must not hide a Makeover. Null when none qualifies.
 */
export function makeoverBar(
  result: { noDownside: readonly ImproveOption[]; tradeOffs: readonly ImproveOption[] },
  index: VariationIndex
): number | null {
  const shapeOnly = (candidate: ImproveCandidate | undefined): boolean => {
    for (let link = candidate; link; link = link.pairedWith) {
      const meta = index.types[link.toTypeId]?.metaGroupId ?? TECH_I;
      if (meta !== TECH_I && meta !== TECH_II) return false;
    }
    return true;
  };
  const scores = [...result.noDownside, ...result.tradeOffs]
    .filter((option) => shapeOnly(option.candidate))
    .map((option) => option.score);
  return scores.length > 0 ? Math.max(...scores) : null;
}

/** The most whole-fit calculations one Makeover search makes (the last confirms the result): about 9–16 s in the browser worker. */
export const MAKEOVER_CALCS = 300;
/** A lazy round stops once its best fresh gain beats every remaining move's last gain by this much. */
const LAZY_MARGIN = 0.01;
/** Moves that gained but overran the fit's budget, tried with a move that frees what they need. */
const PAIR_SEEDS = 8;
/** Pairs calculated whole when the rounds stall, best estimate first. */
const PAIRS_TRIED = 10;
/** A Makeover is shown only when it beats the best single change by this share of that change's gain. */
const BEATS_SINGLE = 0.05;

export interface FindMakeoverParams {
  fitting: Fitting;
  /** The open Fitting's own stats, under the same conditions as `stats`. */
  before: FittingStats;
  goal: ImproveGoal;
  /** The one-slot moves to try on a fit (`makeoverMoves` with the catalogue bound). */
  moves: (fitting: Fitting) => readonly ImproveCandidate[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  target?: TargetProfile;
  hold?: ImproveHold;
  /** The Improve Job and, for Explore, its space: Best overall's weights, and its drop limits on every step and the final fit. */
  jobSetting?: JobSetting;
  /** The total fit price may not pass it. Null: no limit. */
  iskBudget?: number | null;
  fitTotal?: number | null;
  /**
   * The best score Improve's own single swaps reached (`bestScore`), which the
   * Makeover must beat; absent: the best one-slot move of the first round.
   */
  bestSingle?: number | null;
  /** Calculations allowed before the search stops with the best fit so far. */
  maxCalcs?: number;
  /**
   * Whole-fit calculations in flight at once (the worker pool's size). Moves
   * are calculated ahead of the one being scored and scored in order, so the
   * result equals a serial run's; calculations cut off by the lazy stop still
   * count against `maxCalcs`. Default 1.
   */
  concurrency?: number;
  /** False: every round recalculates every move (the plain search, for comparison). */
  lazy?: boolean;
  /** False: no pair is tried when the rounds stop gaining. */
  pairKick?: boolean;
  /**
   * How common a move's target group is on the hull for the job, 0..1 (#5581).
   * When two moves' gains are within 1% of each other, the more common wins;
   * never part of a score. Absent: the larger gain wins, as before.
   */
  targetShare?: (move: ImproveCandidate) => number;
  /**
   * The propulsion the job needs (#5578), added as a forced first step: when the open fit has
   * none, the passing move that costs the least score is applied before the search starts, and
   * the search then works round it (the last propulsion module is guarded like any job's).
   * A constraint on the finished fit would have the greedy spend the slot first and then undo
   * its work to make room. Absent, or no move passes: no propulsion is forced.
   */
  propulsion?: PropulsionStart | null;
  onProgress?: (calcs: number, max: number) => void;
  isCancelled?: () => boolean;
  shouldStop?: () => boolean;
}

export interface Makeover {
  /** The changes from the open fit to the Makeover, identical ones merged into one row. */
  rows: ImproveCandidate[];
  fitting: Fitting;
  after: FittingStats;
  /** The goal's gain against the open fit. */
  score: number;
  iskDelta: number | null;
  lost: LostStat[];
}

export interface MakeoverSearch {
  /** Null when no Makeover of two or more changes beats the best single change. */
  makeover: Makeover | null;
  calcs: number;
  /** "Show best so far" or the calculation cap ended it early. */
  stopped: boolean;
}

/** One calculated move from the current fit. */
interface Trial {
  move: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  /** The goal's score of the moved fit against the original, before any Guardrail; null when unscored. */
  score: number | null;
  /** Passes every Guardrail. */
  ok: boolean;
}

/** What one move did when last calculated (or was estimated to do), for the lazy order and the pairs. */
interface MoveRecord {
  fromTypeId: number | null;
  toTypeId: number;
  rack: FittingSlotKind;
  /** Gain over the fit it was measured on; -Infinity for a failed or unscored calculation. */
  gain: number;
  /** CPU, powergrid and calibration it freed; absent for an estimate. */
  freed?: Readonly<Record<Resource, number>>;
}

/** Moves of one type into another in one rack are the same move, whichever copy stands for them. */
const moveKey = (fromTypeId: number | null, toTypeId: number, rack: FittingSlotKind) =>
  `${fromTypeId ?? '-'}>${toTypeId}>${rack}`;
const keyOf = (move: ImproveCandidate) => moveKey(move.fromTypeId, move.toTypeId, move.at[0].slot);
const sameSlot = (a: ImproveCandidate, b: ImproveCandidate) =>
  a.at.some((x) => b.at.some((y) => x.slot === y.slot && x.slotIndex === y.slotIndex));
const addIsk = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** Ends the search: Cancel (nothing comes back), or "Show best so far" and the cap. */
class SearchHalt {
  constructor(readonly cancelled: boolean) {}
}

/**
 * Lazy greedy over one-slot moves, then a pair when it stalls. Null when
 * cancelled. The figures of the result are one recalculation of its rows on
 * the open fit.
 */
export async function findMakeover({
  fitting: original,
  before,
  goal,
  moves,
  stats,
  priceOf,
  target,
  hold = DEFAULT_IMPROVE_HOLD,
  jobSetting,
  iskBudget = null,
  fitTotal = null,
  bestSingle: givenSingle,
  maxCalcs = MAKEOVER_CALCS,
  concurrency = 1,
  lazy = true,
  pairKick = true,
  targetShare,
  propulsion,
  onProgress,
  isCancelled,
  shouldStop,
}: FindMakeoverParams): Promise<MakeoverSearch | null> {
  // A fit that doesn't fit has nothing to improve yet (`20261019-144736`): the budget
  // Guardrail binds only from a fit within budget, so searching one past it is unguarded.
  if (!fitsResourceBudget(before)) return { makeover: null, calcs: 0, stopped: false };
  let calcs = 0;
  let stopped = false;
  const minGain = goal === 'cheaper' ? 0 : EPSILON;
  const scoreAt = (after: FittingStats, isk: number | null) =>
    scoreOf(goal, before, after, isk, target, hold, jobSetting?.job);
  const passes = (after: FittingStats, isk: number | null) =>
    newRuleBreaks(before.ruleBreaks, after.ruleBreaks).length === 0 &&
    brokenGuardrail(goal, before, after, target, undefined, { jobSetting, makeover: true }) ===
      null &&
    !overIskBudget(iskBudget, fitTotal, isk);

  /** Whether the next calculation may start; false once cancelled, stopped or at the cap (the last of it is kept for the result). */
  const mayStart = () => !isCancelled?.() && !shouldStop?.() && calcs < maxCalcs - 1;

  /** Starts one whole-fit calculation (counted now); a failure is kept as null, never a loose rejection. */
  function begin(fitting: Fitting): Promise<FittingStats | null> {
    calcs++;
    return Promise.resolve()
      .then(() => stats(fitting))
      .catch(() => null);
  }

  let fitting = original;
  let current = before;
  let isk: number | null = 0;
  let score = 0;
  let steps = 0;
  let firstRoundBest: number | null = null;
  const records = new Map<string, MoveRecord>();

  /** Scores a calculated move against the current fit and notes what it did. */
  function settle(
    move: ImproveCandidate,
    moved: Fitting,
    after: FittingStats | null
  ): Trial | null {
    const moveIsk = addIsk(isk, iskDeltaOf(move, priceOf));
    const moveScore = after ? scoreAt(after, moveIsk) : null;
    if (!move.pairedWith)
      records.set(keyOf(move), {
        fromTypeId: move.fromTypeId,
        toTypeId: move.toTypeId,
        rack: move.at[0].slot,
        gain: moveScore === null ? -Infinity : moveScore - score,
        ...(after
          ? {
              freed: freedBy(current, after),
            }
          : {}),
      });
    if (!after) return null;
    return {
      move,
      fitting: moved,
      after,
      score: moveScore,
      ok: moveScore !== null && passes(after, moveIsk),
    };
  }

  /**
   * Calculates `list` in order, `concurrency` ahead of the move being scored,
   * and hands each result to `take` in list order (so the outcome is a serial
   * run's). `stopAt(move)` is asked before a move is scored; calculations
   * already started for the moves after it are dropped but stay counted.
   */
  async function evaluate(
    list: readonly ImproveCandidate[],
    stopAt: (move: ImproveCandidate) => boolean,
    take: (trial: Trial | null) => void
  ) {
    const ahead = Math.max(1, Math.floor(concurrency));
    const started = new Map<number, { moved: Fitting; after: Promise<FittingStats | null> }>();
    let next = 0;
    const startUpTo = (last: number) => {
      for (; next <= last && next < list.length && mayStart(); next++) {
        const moved = applyImproveCandidate(fitting, list[next]);
        started.set(next, { moved, after: begin(moved) });
      }
    };
    for (const [index, move] of list.entries()) {
      if (stopAt(move)) break;
      startUpTo(index + ahead - 1);
      const run = started.get(index);
      // Not started: cancelled, stopped or at the cap.
      if (!run || isCancelled?.() || shouldStop?.()) throw new SearchHalt(!!isCancelled?.());
      started.delete(index);
      const after = await run.after;
      if (isCancelled?.()) throw new SearchHalt(true);
      onProgress?.(Math.min(calcs, maxCalcs), maxCalcs);
      take(settle(move, run.moved, after));
    }
    // Dropped calculations finish before the next round, so no more than `concurrency` are ever in flight.
    await Promise.all([...started.values()].map((run) => run.after));
  }

  const gainOf = (trial: Trial | null) => (trial?.score ?? -Infinity) - score;

  /** Whether `trial` is the better move: the larger gain, or within 1% of it the more common target group. */
  const trialBeats = (trial: Trial, best: Trial): boolean => {
    if (targetShare && withinTie(gainOf(trial), gainOf(best))) {
      const common = targetShare(trial.move) - targetShare(best.move);
      if (common !== 0) return common > 0;
    }
    return gainOf(trial) > gainOf(best);
  };

  /** The slots an earlier step already changed. */
  const placed = new Set<string>();
  const slotKey = (at: { slot: FittingSlotKind; slotIndex: number }) =>
    `${at.slot}:${at.slotIndex}`;

  /**
   * Whether `trial` only swaps a module an earlier step placed for a target group that is
   * less common on the hull, for a gain within 1% of the score already reached: the first
   * step's tie-break stands. (An original module is never held by this.)
   */
  const undoesTieBreak = (trial: Trial): boolean => {
    if (!targetShare || trial.move.fromTypeId === null || !withinTie(score + gainOf(trial), score))
      return false;
    return (
      trial.move.at.every((at) => placed.has(slotKey(at))) &&
      targetShare(trial.move) < targetShare({ ...trial.move, toTypeId: trial.move.fromTypeId })
    );
  };

  /** A round's best passing move so far, taken if "Show best so far" or the cap ends the round. */
  const pending = (() => {
    let best: Trial | null = null;
    return {
      get: (): Trial | null => best,
      clear: () => {
        best = null;
      },
      offer: (trial: Trial) => {
        if (!undoesTieBreak(trial) && (best === null || trialBeats(trial, best))) best = trial;
      },
    };
  })();

  /** A round: the best passing move from the current fit, and the fresh moves that overran the budget. */
  async function round(first: boolean) {
    const list = [...moves(fitting)];
    const bound = (move: ImproveCandidate) => records.get(keyOf(move))?.gain ?? Infinity;
    if (lazy) list.sort((a, b) => bound(b) - bound(a));
    pending.clear();
    const overran: Trial[] = [];
    await evaluate(
      list,
      // Sorted by last gain: once the best fresh gain beats this move's last one, it beats the rest too.
      (move) => {
        const gainBound = bound(move);
        return (
          lazy &&
          !first &&
          pending.get() !== null &&
          gainBound !== Infinity &&
          gainOf(pending.get()) >= gainBound + LAZY_MARGIN
        );
      },
      (trial) => {
        if (!trial || trial.score === null) return;
        if (trial.ok) pending.offer(trial);
        else if (
          // A fit over its budget already is Make it fit's, not a pair's to fix.
          gainOf(trial) > minGain &&
          fitsResourceBudget(current) &&
          overrunBy(trial.after).length > 0
        )
          overran.push(trial);
      }
    );
    const best = pending.get();
    if (first) firstRoundBest = best?.score ?? null;
    return { best, overran };
  }

  /** The best passing pair of a budget-overrunning gain and a move that freed what it needs. */
  async function tryPairs(overran: Trial[]): Promise<Trial | null> {
    const seeds = overran.sort((a, b) => gainOf(b) - gainOf(a)).slice(0, PAIR_SEEDS);
    const pairs: { candidate: ImproveCandidate; estimate: number }[] = [];
    for (const seed of seeds) {
      for (const freer of moves(fitting)) {
        if (sameSlot(freer, seed.move)) continue;
        const record = records.get(keyOf(freer));
        if (!record?.freed || coveringFreed(seed.after, record.freed) === null) continue;
        pairs.push({
          candidate: { ...seed.move, pairedWith: freer },
          estimate: gainOf(seed) + (record?.gain ?? 0),
        });
      }
    }
    pairs.sort((a, b) => b.estimate - a.estimate);
    pending.clear();
    await evaluate(
      pairs.slice(0, PAIRS_TRIED).map((pair) => pair.candidate),
      () => false,
      (trial) => {
        if (trial?.ok) pending.offer(trial);
      }
    );
    return pending.get();
  }

  /**
   * A placed module's own moves start from an estimate, not unknown: moving X
   * (which replaced F) on to Y is about F → Y's gain less F → X's. Without it
   * every module a step places is recalculated against all its targets. Only
   * the lazy order reads it, and a move that looks close is calculated.
   */
  function estimateFrom(move: ImproveCandidate, gain: number) {
    if (move.fromTypeId === null) return;
    const rack = move.at[0].slot;
    const estimate = (toTypeId: number, estimated: number) => {
      const key = moveKey(move.toTypeId, toTypeId, rack);
      if (!records.has(key))
        records.set(key, { fromTypeId: move.toTypeId, toTypeId, rack, gain: estimated });
    };
    for (const record of [...records.values()])
      if (record.fromTypeId === move.fromTypeId && record.rack === rack)
        estimate(record.toTypeId, record.gain - gain);
    estimate(move.fromTypeId, -gain);
  }

  function applyStep(trial: Trial) {
    const gain = gainOf(trial);
    for (let link: ImproveCandidate | undefined = trial.move; link; link = link.pairedWith)
      estimateFrom(link, gain);
    for (let link: ImproveCandidate | undefined = trial.move; link; link = link.pairedWith)
      for (const at of link.at) placed.add(slotKey(at));
    fitting = trial.fitting;
    current = trial.after;
    isk = addIsk(isk, iskDeltaOf(trial.move, priceOf));
    score = trial.score ?? score;
    steps++;
  }

  let forced: { slot: FittingSlotKind; slotIndex: number } | null = null;

  /** The forced propulsion step: the best passing move of the first tier that has one. */
  async function addPropulsion() {
    for (const tier of propulsion?.tiers(fitting) ?? []) {
      pending.clear();
      await evaluate(
        tier,
        () => false,
        (trial) => {
          if (trial?.ok) pending.offer(trial);
        }
      );
      const best = pending.get();
      if (best) {
        applyStep(best);
        forced = best.move.at[0];
        return;
      }
    }
  }

  try {
    await addPropulsion();
    for (let first = true; ; first = false) {
      const { best, overran } = await round(first);
      if (best && gainOf(best) > minGain) {
        applyStep(best);
        continue;
      }
      const pair = pairKick ? await tryPairs(overran) : null;
      if (pair && gainOf(pair) > minGain) {
        applyStep(pair);
        continue;
      }
      break;
    }
  } catch (error) {
    if (!(error instanceof SearchHalt)) throw error;
    if (error.cancelled) return null;
    stopped = true;
    // The interrupted round's best so far still counts.
    const interrupted = pending.get();
    if (interrupted && gainOf(interrupted) > minGain) applyStep(interrupted);
  }

  if (steps === 0) return { makeover: null, calcs, stopped };
  const rows = rowsBetween(original, fitting);
  // The row that holds the forced module says why it is there, whatever the search made of it since.
  const forcedRow =
    propulsion && forced
      ? rows.find(
          (row) =>
            propulsion.isPropulsion(row.toTypeId) &&
            row.at.some((at) => at.slot === forced!.slot && at.slotIndex === forced!.slotIndex)
        )
      : undefined;
  if (forcedRow && propulsion) forcedRow.addsPropulsionFor = propulsion.job;
  if (rows.length < 2) return { makeover: null, calcs, stopped };
  // The figures shown are one recalculation of the rows, never the path's last step.
  const remade = rows.reduce(applyImproveCandidate, original);
  const after = await begin(remade);
  if (!after) return { makeover: null, calcs, stopped };
  if (isCancelled?.()) return null;
  onProgress?.(calcs, maxCalcs);
  const iskDelta = rows.reduce<number | null>(
    (sum, row) => addIsk(sum, iskDeltaOf(row, priceOf)),
    0
  );
  const total = scoreAt(after, iskDelta);
  const single = givenSingle ?? firstRoundBest ?? 0;
  const beats =
    total !== null &&
    passes(after, iskDelta) &&
    total - single > Math.max(EPSILON, BEATS_SINGLE * Math.abs(single));
  return {
    makeover: beats
      ? { rows, fitting: remade, after, score: total, iskDelta, lost: lostStats(before, after) }
      : null,
    calcs,
    stopped,
  };
}

/**
 * The changes from `from` to `to`, slot by slot: a slot changed twice shows
 * once, first module to last, and the same change in several slots is one
 * row. Swaps and fills only: a slot `to` leaves empty gives no row (the
 * Makeover never empties one).
 */
export function rowsBetween(from: Fitting, to: Fitting): ImproveCandidate[] {
  const at = (fitting: Fitting, slot: FittingSlotKind, slotIndex: number) =>
    fitting.modules.find((m) => m.slot === slot && m.slotIndex === slotIndex)?.typeId ?? null;
  const rows = new Map<string, ImproveCandidate>();
  for (const module of to.modules) {
    const was = at(from, module.slot, module.slotIndex);
    if (was === module.typeId) continue;
    const key = `${was ?? '-'}>${module.typeId}`;
    const row = rows.get(key);
    const where = { slot: module.slot, slotIndex: module.slotIndex };
    if (row) row.at.push(where);
    else rows.set(key, { fromTypeId: was, toTypeId: module.typeId, at: [where] });
  }
  return [...rows.values()];
}
