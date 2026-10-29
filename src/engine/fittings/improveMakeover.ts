/**
 * Improve's makeover: a whole-fit rework found by chaining swaps (issue #5560,
 * parent #5548). `findImprovements` scores one module type at a time against
 * the unchanged fit; this search applies the best one-slot move, looks again
 * from the result, and repeats, so linked changes, a split of two copies into
 * two different modules, and a pair where one half only pays off because the
 * other frees CPU or powergrid all show up. Every figure is still a whole-fit
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
  EPSILON,
  fittedSide,
  iskDeltaOf,
  lostStats,
  overIskBudget,
  scoreOf,
  type CandidateOptions,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveHold,
  type LostStat,
} from './improve';
import { jobOf, reworkGroups, scoredJobs, UNIQUE_GROUPS, type DefenseSide } from './improveGroups';
import { overageOf, RESOURCES, usedOf, type Resource } from './makeItFit';
import { newRuleBreaks } from './ruleBreaks';
import { fitsResourceBudget } from './skillGaps';
import type { TargetProfile } from './targetProfile';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats } from './types';

/** Racks an empty slot is filled in: the same ones as Improve's fills. */
const FILL_RACKS: readonly FittingSlotKind[] = ['high', 'medium', 'low', 'rig'];
const TECH_I = 1;
const TECH_II = 2;

/**
 * The one-slot moves the makeover tries on `modules`. One copy stands for
 * identical copies (the first in the rack), so a split costs no more than a
 * whole-type swap. Targets are the module's own group and the goal's Rework
 * groups (`reworkGroups`), one tier per group: Tech II, else Tech I. Faction,
 * deadspace and officer steps stay in Improve's Upgrade rows, so the makeover
 * changes the fit's shape and not its price tier. The first empty slot of each
 * rack takes the same groups. The filters match `improveCandidates`: rack,
 * market-listed, `flyable`, a second unique module, the last module doing a
 * job the goal does not score, rigs only when included.
 */
export function makeoverMoves(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  options: Partial<CandidateOptions>
): ImproveCandidate[] {
  const goal = options.goal ?? 'overall';
  const defense = options.defense ?? 'keep';
  const pool = options.pool;
  if (!pool) return [];
  const groupOf = pool.groupOf;
  const side = fittedSide(modules, groupOf);
  const sides: DefenseSide[] =
    defense === 'keep' ? (side ? [side] : ['shield', 'armor']) : [defense];
  const goalGroups = reworkGroups(goal, sides);
  const scored = scoredJobs(goal);
  const usesRack = (slot: FittingSlotKind) =>
    slot !== 'subsystem' && (slot !== 'rig' || options.includeRigs === true);

  const groupsFitted = new Map<number, number>();
  const jobsFitted = new Map<string, number>();
  for (const module of modules) {
    const group = groupOf(module.typeId);
    if (group === undefined) continue;
    groupsFitted.set(group, (groupsFitted.get(group) ?? 0) + 1);
    const job = jobOf(group);
    if (job) jobsFitted.set(job, (jobsFitted.get(job) ?? 0) + 1);
  }

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

  /** Whether `typeId` may go in a slot whose module (of `fromGroup`, or none) leaves. */
  const allowed = (typeId: number, fromGroup: number | undefined) => {
    const group = groupOf(typeId);
    if (group === undefined || !UNIQUE_GROUPS.has(group)) return true;
    return (groupsFitted.get(group) ?? 0) - (fromGroup === group ? 1 : 0) < 1;
  };

  const moves: ImproveCandidate[] = [];
  const seen = new Set<string>();
  for (const module of [...modules].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const { slot, slotIndex, typeId: fromTypeId } = module;
    if (!usesRack(slot) || seen.has(`${slot}:${fromTypeId}`)) continue;
    seen.add(`${slot}:${fromTypeId}`);
    const from = groupOf(fromTypeId);
    const job = jobOf(from);
    const lastOfJob = job !== null && !scored.includes(job) && (jobsFitted.get(job) ?? 0) <= 1;
    const offered = new Set<number>([fromTypeId]);
    for (const group of new Set([...(from === undefined ? [] : [from]), ...goalGroups])) {
      if (lastOfJob && jobOf(group) !== job) continue;
      for (const toTypeId of representatives(group, slot)) {
        if (offered.has(toTypeId) || !allowed(toTypeId, from)) continue;
        offered.add(toTypeId);
        moves.push({ fromTypeId, toTypeId, at: [{ slot, slotIndex }] });
      }
    }
  }

  if (options.slotCounts) {
    for (const slot of FILL_RACKS) {
      if (!usesRack(slot)) continue;
      const taken = new Set(modules.filter((m) => m.slot === slot).map((m) => m.slotIndex));
      let free = 0;
      while (free < options.slotCounts[slot] && taken.has(free)) free++;
      if (free >= options.slotCounts[slot]) continue;
      const offered = new Set<number>();
      for (const group of goalGroups)
        for (const toTypeId of representatives(group, slot)) {
          if (offered.has(toTypeId) || !allowed(toTypeId, undefined)) continue;
          offered.add(toTypeId);
          moves.push({ fromTypeId: null, toTypeId, at: [{ slot, slotIndex: free }] });
        }
    }
  }
  return moves;
}

/** The most whole-fit calculations one makeover search makes: about 9–16 s in the browser worker. */
export const MAKEOVER_CALCS = 300;
/** A lazy round stops once its best fresh gain beats every remaining move's last gain by this much. */
const LAZY_MARGIN = 0.01;
/** Moves that gained but overran the fit's budget, tried with a move that frees what they need. */
const KICK_SEEDS = 8;
/** Pairs calculated whole per kick, best estimate first. */
const KICK_PAIRS = 10;
/** A makeover is shown only when it beats the best single move by this share of that move's gain. */
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
  /** The total fit price may not pass it. Null: no limit. */
  iskBudget?: number | null;
  fitTotal?: number | null;
  /** Calculations allowed before the search stops with the best fit so far. */
  maxCalcs?: number;
  /** False: every round recalculates every move (the plain search, for comparison). */
  lazy?: boolean;
  /** False: no pair is tried when the rounds stop gaining. */
  pairKick?: boolean;
  onProgress?: (calcs: number, max: number) => void;
  isCancelled?: () => boolean;
  shouldStop?: () => boolean;
}

export interface Makeover {
  /** The changes from the open fit to the makeover, identical ones merged into one row. */
  rows: ImproveCandidate[];
  fitting: Fitting;
  after: FittingStats;
  /** The goal's gain against the open fit. */
  score: number;
  iskDelta: number | null;
  lost: LostStat[];
}

export interface MakeoverSearch {
  /** Null when no makeover of two or more changes beats the best single move. */
  makeover: Makeover | null;
  calcs: number;
  /** "Show best so far" or the calculation cap ended it early. */
  stopped: boolean;
}

/** One calculated move from the current fit. */
interface Tried {
  move: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  /** The goal's score of the moved fit against the original, before any Guardrail; null when unscored. */
  score: number | null;
  ok: boolean;
}

const moveKey = (move: ImproveCandidate) =>
  `${move.fromTypeId ?? '-'}>${move.toTypeId}>${move.at[0]?.slot}`;
const sameSlot = (a: ImproveCandidate, b: ImproveCandidate) =>
  a.at.some((x) => b.at.some((y) => x.slot === y.slot && x.slotIndex === y.slotIndex));
const addIsk = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

class Stop {
  constructor(readonly cancelled: boolean) {}
}

/**
 * Lazy greedy over one-slot moves, then a pair kick when it stalls. Null when
 * cancelled. See the module comment for the shape; the figures of the
 * result are one recalculation of its rows on the open fit.
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
  iskBudget = null,
  fitTotal = null,
  maxCalcs = MAKEOVER_CALCS,
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
    scoreOf(goal, before, after, isk, target, hold);
  const passes = (after: FittingStats, isk: number | null) =>
    newRuleBreaks(before.ruleBreaks, after.ruleBreaks).length === 0 &&
    brokenGuardrail(goal, before, after, target) === null &&
    !overIskBudget(iskBudget, fitTotal, isk);

  /** One whole-fit calculation, or null when it failed. */
  async function calc(fitting: Fitting): Promise<FittingStats | null> {
    if (isCancelled?.()) throw new Stop(true);
    if (shouldStop?.() || calcs >= maxCalcs) throw new Stop(false);
    calcs++;
    let after: FittingStats | null = null;
    try {
      after = await stats(fitting);
    } catch {
      // Left out: one move's calculation failing must not end the search.
    }
    if (isCancelled?.()) throw new Stop(true);
    onProgress?.(calcs, maxCalcs);
    return after;
  }

  let fitting = original;
  let current = before;
  let isk: number | null = 0;
  let score = 0;
  let steps = 0;
  let bestSingle: number | null = null;
  /** Each move's last raw gain, for the lazy order. */
  const lastGain = new Map<string, number>();
  /** Each move's last freed CPU, powergrid and calibration, for the pair estimate. */
  const freedBy = new Map<string, Partial<Record<Resource, number>>>();

  async function tryMove(move: ImproveCandidate): Promise<Tried | null> {
    const moved = applyImproveCandidate(fitting, move);
    const after = await calc(moved);
    if (!after) return null;
    const moveIsk = addIsk(isk, iskDeltaOf(move, priceOf));
    const moveScore = scoreAt(after, moveIsk);
    if (!move.pairedWith) {
      lastGain.set(moveKey(move), moveScore === null ? -Infinity : moveScore - score);
      freedBy.set(
        moveKey(move),
        Object.fromEntries(RESOURCES.map((r) => [r, usedOf(current, r) - usedOf(after, r)]))
      );
    }
    return {
      move,
      fitting: moved,
      after,
      score: moveScore,
      ok: moveScore !== null && passes(after, moveIsk),
    };
  }

  /** A round: the best passing move from the current fit, and the fresh moves that overran the budget. */
  async function round(first: boolean) {
    const list = [...moves(fitting)];
    const bound = (move: ImproveCandidate) => lastGain.get(moveKey(move)) ?? Infinity;
    if (lazy) list.sort((a, b) => bound(b) - bound(a));
    let best: Tried | null = null;
    const overran: Tried[] = [];
    for (const move of list) {
      const gainBound = bound(move);
      if (
        lazy &&
        !first &&
        best !== null &&
        best.score !== null &&
        Number.isFinite(gainBound) &&
        best.score - score >= gainBound + LAZY_MARGIN
      )
        break;
      const tried = await tryMove(move);
      if (!tried || tried.score === null) continue;
      if (tried.ok) {
        if (!best || tried.score > (best.score ?? -Infinity)) best = tried;
      } else if (
        // A fit over its budget already is Make it fit's, not a pair's to fix.
        tried.score - score > minGain &&
        fitsResourceBudget(current) &&
        RESOURCES.some((r) => overageOf(tried.after, r) > 0)
      )
        overran.push(tried);
    }
    if (first) bestSingle = best?.score ?? null;
    return { best, overran };
  }

  /** The best passing pair of a budget-overrunning gain and a move that frees what it needs. */
  async function kick(overran: Tried[]): Promise<Tried | null> {
    const seeds = overran.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, KICK_SEEDS);
    const pairs: { candidate: ImproveCandidate; estimate: number }[] = [];
    for (const seed of seeds) {
      const over = RESOURCES.filter((r) => overageOf(seed.after, r) > 0);
      for (const freer of moves(fitting)) {
        if (sameSlot(freer, seed.move)) continue;
        const freed = freedBy.get(moveKey(freer));
        if (!freed || !over.every((r) => (freed[r] ?? 0) >= overageOf(seed.after, r))) continue;
        pairs.push({
          candidate: { ...seed.move, pairedWith: freer },
          estimate: (seed.score ?? 0) - score + (lastGain.get(moveKey(freer)) ?? 0),
        });
      }
    }
    pairs.sort((a, b) => b.estimate - a.estimate);
    let best: Tried | null = null;
    for (const { candidate } of pairs.slice(0, KICK_PAIRS)) {
      const tried = await tryMove(candidate);
      if (tried?.ok && (!best || (tried.score ?? 0) > (best.score ?? 0))) best = tried;
    }
    return best;
  }

  /**
   * A placed module's own moves start from an estimate, not unknown: moving X
   * (which replaced F) on to Y is about F → Y's gain less F → X's. Without it
   * every module a step places is recalculated against all its targets.
   */
  const estimateFrom = (move: ImproveCandidate, gain: number) => {
    if (move.fromTypeId === null) return;
    const rack = move.at[0]?.slot;
    const prefix = `${move.fromTypeId}>`;
    for (const [key, last] of [...lastGain]) {
      if (!key.startsWith(prefix) || !key.endsWith(`>${rack}`)) continue;
      const to = key.slice(prefix.length, key.length - rack.length - 1);
      const estimate = `${move.toTypeId}>${to}>${rack}`;
      if (!lastGain.has(estimate)) lastGain.set(estimate, last - gain);
    }
    const back = `${move.toTypeId}>${move.fromTypeId}>${rack}`;
    if (!lastGain.has(back)) lastGain.set(back, -gain);
  };

  const take = (tried: Tried) => {
    const gain = (tried.score ?? score) - score;
    for (let link: ImproveCandidate | undefined = tried.move; link; link = link.pairedWith)
      estimateFrom(link, gain);
    fitting = tried.fitting;
    current = tried.after;
    isk = addIsk(isk, iskDeltaOf(tried.move, priceOf));
    score = tried.score ?? score;
    steps++;
  };

  try {
    for (let first = true; ; first = false) {
      const { best, overran } = await round(first);
      if (best && (best.score ?? 0) - score > minGain) {
        take(best);
        continue;
      }
      const pair = pairKick ? await kick(overran) : null;
      if (pair && (pair.score ?? 0) - score > minGain) {
        take(pair);
        continue;
      }
      break;
    }
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    if (error.cancelled) return null;
    stopped = true;
  }

  if (steps === 0) return { makeover: null, calcs, stopped };
  const rows = rowsBetween(original, fitting);
  if (rows.length < 2) return { makeover: null, calcs, stopped };
  // The figures shown are one recalculation of the rows, never the path's last step.
  const remade = rows.reduce(applyImproveCandidate, original);
  let after: FittingStats;
  try {
    after = await stats(remade);
  } catch {
    return { makeover: null, calcs, stopped };
  }
  calcs++;
  if (isCancelled?.()) return null;
  const iskDelta = rows.reduce<number | null>(
    (sum, row) => addIsk(sum, iskDeltaOf(row, priceOf)),
    0
  );
  const total = scoreAt(after, iskDelta);
  const single = bestSingle ?? 0;
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
 * once, first module to last, and the same change in several slots is one row.
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
