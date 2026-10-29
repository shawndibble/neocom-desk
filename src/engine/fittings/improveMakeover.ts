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
  applyImproveCandidate,
  brokenGuardrail,
  DEFAULT_IMPROVE_HOLD,
  defenseSides,
  EPSILON,
  FILL_RACKS,
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
import { jobOf, reworkGroups, TANK_GOALS, TANK_GROUPS, UNIQUE_GROUPS } from './improveGroups';
import {
  HELD_EVERY_COPY,
  holdsTankModules,
  unguardedJobs,
  type ExploreSpace,
  type ImproveJob,
} from './improveJob';
import { overageOf, RESOURCES, usedOf, type Resource } from './makeItFit';
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
  /** The Improve Job: its freed jobs may go. Absent: today's guard. */
  job?: ImproveJob;
  /** Explore's space: Dangerous keeps tank modules tank modules. */
  space?: ExploreSpace;
  /** Market-listed, hull and skill checks, and the groups' members. */
  pool: ModulePool;
  /** The hull's slots per rack, to find the empty ones; absent: no fills. */
  slotCounts?: Readonly<Record<FittingSlotKind, number>>;
}

/**
 * The one-slot moves the Makeover tries on `modules`. One copy stands for
 * identical copies (the first in the rack), so a split costs no more than a
 * whole-type swap. Targets are the module's own group and the goal's Rework
 * groups (`reworkGroups`), one tier per group: Tech II, else Tech I. Faction,
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
  { goal, defense, includeRigs, pool, slotCounts, job, space }: MakeoverMoveOptions
): ImproveCandidate[] {
  const groupOf = pool.groupOf;
  const goalGroups = reworkGroups(goal, defenseSides(modules, groupOf, defense));
  const scored = unguardedJobs(goal, job);
  const heldWhole = job ? HELD_EVERY_COPY[job] : [];
  const holdsTank = holdsTankModules(job, space);
  const freesTank = defense !== 'keep' && TANK_GOALS.has(goal);
  const usesRack = (slot: FittingSlotKind) =>
    slot !== 'subsystem' && (slot !== 'rig' || includeRigs);

  const groupsFitted = new Map<number, number>();
  const jobsFitted = new Map<string, number>();
  for (const module of modules) {
    const group = groupOf(module.typeId);
    if (group === undefined) continue;
    groupsFitted.set(group, (groupsFitted.get(group) ?? 0) + 1);
    const job = jobOf(group);
    if (job) jobsFitted.set(job, (jobsFitted.get(job) ?? 0) + 1);
  }

  // A type outside the variation index has no variations: it is its group's Tech I.
  const metaOf = (typeId: number) => index.types[typeId]?.metaGroupId ?? TECH_I;
  const tiers = new Map<string, readonly number[]>();
  /** The group's Tech II members for the rack the hull takes and the pilot flies, else its Tech I. */
  const representatives = (group: number, slot: FittingSlotKind): readonly number[] => {
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
      found = techTwo.length > 0 ? techTwo : members.filter((typeId) => metaOf(typeId) === TECH_I);
      tiers.set(key, found);
    }
    return found;
  };

  /** Whether `group` may take a slot whose module (of `fromGroup`, or none) leaves. */
  const allowed = (group: number, fromGroup: number | undefined) => {
    if (freesTank && TANK_GROUPS.has(group) && !TANK_GROUPS.has(fromGroup ?? -1)) return false;
    if (!UNIQUE_GROUPS.has(group)) return true;
    return (groupsFitted.get(group) ?? 0) - (fromGroup === group ? 1 : 0) < 1;
  };

  const moves: ImproveCandidate[] = [];
  const seen = new Set<string>();
  for (const module of [...modules].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const { slot, slotIndex, typeId: fromTypeId } = module;
    if (!usesRack(slot) || seen.has(`${slot}:${fromTypeId}`)) continue;
    seen.add(`${slot}:${fromTypeId}`);
    const from = groupOf(fromTypeId);
    const fromJob = jobOf(from);
    const lastOfJob =
      fromJob !== null &&
      !scored.includes(fromJob) &&
      ((jobsFitted.get(fromJob) ?? 0) <= 1 || heldWhole.includes(fromJob));
    const offered = new Set<number>([fromTypeId]);
    for (const group of new Set([...(from === undefined ? [] : [from]), ...goalGroups])) {
      if ((lastOfJob && jobOf(group) !== fromJob) || !allowed(group, from)) continue;
      if (holdsTank && TANK_GROUPS.has(from ?? -1) && !TANK_GROUPS.has(group)) continue;
      for (const toTypeId of representatives(group, slot)) {
        if (offered.has(toTypeId)) continue;
        offered.add(toTypeId);
        moves.push({ fromTypeId, toTypeId, at: [{ slot, slotIndex }] });
      }
    }
  }

  if (slotCounts) {
    for (const slot of FILL_RACKS) {
      if (!usesRack(slot)) continue;
      const taken = new Set(modules.filter((m) => m.slot === slot).map((m) => m.slotIndex));
      let free = 0;
      while (free < slotCounts[slot] && taken.has(free)) free++;
      if (free >= slotCounts[slot]) continue;
      const offered = new Set<number>();
      for (const group of goalGroups) {
        if (!allowed(group, undefined)) continue;
        for (const toTypeId of representatives(group, slot)) {
          if (offered.has(toTypeId)) continue;
          offered.add(toTypeId);
          moves.push({ fromTypeId: null, toTypeId, at: [{ slot, slotIndex: free }] });
        }
      }
    }
  }
  return moves;
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
  /** The Improve Job (and for Explore, its space): Best overall's weights, and its drop limits on every step and the final fit. */
  job?: ImproveJob;
  space?: ExploreSpace;
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
  job,
  space,
  iskBudget = null,
  fitTotal = null,
  bestSingle: givenSingle,
  maxCalcs = MAKEOVER_CALCS,
  concurrency = 1,
  lazy = true,
  pairKick = true,
  onProgress,
  isCancelled,
  shouldStop,
}: FindMakeoverParams): Promise<MakeoverSearch | null> {
  let calcs = 0;
  let stopped = false;
  const minGain = goal === 'cheaper' ? 0 : EPSILON;
  const scoreAt = (after: FittingStats, isk: number | null) =>
    scoreOf(goal, before, after, isk, target, hold, job);
  const passes = (after: FittingStats, isk: number | null) =>
    newRuleBreaks(before.ruleBreaks, after.ruleBreaks).length === 0 &&
    brokenGuardrail(goal, before, after, target, undefined, { job, space, makeover: true }) ===
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
  /** A round's best passing move so far, taken if "Show best so far" or the cap ends the round. */
  let pending: Trial | null = null;
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
              freed: Object.fromEntries(
                RESOURCES.map((r) => [r, usedOf(current, r) - usedOf(after, r)])
              ) as Record<Resource, number>,
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

  /** A round: the best passing move from the current fit, and the fresh moves that overran the budget. */
  async function round(first: boolean) {
    const list = [...moves(fitting)];
    const bound = (move: ImproveCandidate) => records.get(keyOf(move))?.gain ?? Infinity;
    if (lazy) list.sort((a, b) => bound(b) - bound(a));
    pending = null;
    const overran: Trial[] = [];
    await evaluate(
      list,
      // Sorted by last gain: once the best fresh gain beats this move's last one, it beats the rest too.
      (move) => {
        const gainBound = bound(move);
        return (
          lazy &&
          !first &&
          pending !== null &&
          gainBound !== Infinity &&
          gainOf(pending) >= gainBound + LAZY_MARGIN
        );
      },
      (trial) => {
        if (!trial || trial.score === null) return;
        if (trial.ok) {
          if (gainOf(trial) > gainOf(pending)) pending = trial;
        } else if (
          // A fit over its budget already is Make it fit's, not a pair's to fix.
          gainOf(trial) > minGain &&
          fitsResourceBudget(current) &&
          RESOURCES.some((r) => overageOf(trial.after, r) > 0)
        )
          overran.push(trial);
      }
    );
    const best = pending as Trial | null;
    if (first) firstRoundBest = best?.score ?? null;
    return { best, overran };
  }

  /** The best passing pair of a budget-overrunning gain and a move that freed what it needs. */
  async function tryPairs(overran: Trial[]): Promise<Trial | null> {
    const seeds = overran.sort((a, b) => gainOf(b) - gainOf(a)).slice(0, PAIR_SEEDS);
    const pairs: { candidate: ImproveCandidate; estimate: number }[] = [];
    for (const seed of seeds) {
      const over = RESOURCES.filter((r) => overageOf(seed.after, r) > 0);
      for (const freer of moves(fitting)) {
        if (sameSlot(freer, seed.move)) continue;
        const record = records.get(keyOf(freer));
        const freed = record?.freed;
        if (!freed || !over.every((r) => freed[r] >= overageOf(seed.after, r))) continue;
        pairs.push({
          candidate: { ...seed.move, pairedWith: freer },
          estimate: gainOf(seed) + (record?.gain ?? 0),
        });
      }
    }
    pairs.sort((a, b) => b.estimate - a.estimate);
    pending = null;
    await evaluate(
      pairs.slice(0, PAIRS_TRIED).map((pair) => pair.candidate),
      () => false,
      (trial) => {
        if (trial?.ok && gainOf(trial) > gainOf(pending)) pending = trial;
      }
    );
    return pending;
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
    fitting = trial.fitting;
    current = trial.after;
    isk = addIsk(isk, iskDeltaOf(trial.move, priceOf));
    score = trial.score ?? score;
    steps++;
  }

  try {
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
    const interrupted: Trial | null = pending;
    if (interrupted && gainOf(interrupted) > minGain) applyStep(interrupted);
  }

  if (steps === 0) return { makeover: null, calcs, stopped };
  const rows = rowsBetween(original, fitting);
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
