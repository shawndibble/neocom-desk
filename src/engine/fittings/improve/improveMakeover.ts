import { isMutated, placeKey } from './improveMutated';
import type { VariationIndex } from '../../market/variations';
import {
  commonPropulsionKind,
  MICRO_JUMP_DRIVE_GROUP,
  propulsionKindOf,
  PROPULSION_GROUP,
  withinTie,
  type JobCommonality,
  type PropulsionKind,
} from '../hullCommonality';
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
import type { Resource } from '../makeItFit';
import { newRuleBreaks } from '../ruleBreaks';
import { fitsResourceBudget } from '../skillGaps';
import type { ModuleAt } from '../fittingEdit';
import type { TargetProfile } from '../targetProfile';
import type { Fitting, FittingModule, FittingSlotKind, FittingStats } from '../types';

const TECH_I = 1;
const TECH_II = 2;

export interface MakeoverMoveOptions {
  goal: ImproveGoal;
  defense: DefenseChoice;
  includeRigs: boolean;
  allowMutated?: boolean;
  jobSetting?: JobSetting;
  commonality?: JobCommonality | null;
  pool: ModulePool;
  slotCounts?: Readonly<Record<FittingSlotKind, number>>;
}

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
      found = techTwo.length === 0 ? techOne : slot === 'rig' ? [...techTwo, ...techOne] : techTwo;
      tiers.set(key, found);
    }
    return found;
  };
}

export function makeoverMoves(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  {
    goal,
    defense,
    includeRigs,
    allowMutated,
    pool,
    slotCounts,
    jobSetting,
    commonality,
  }: MakeoverMoveOptions
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

  const allowed = (group: number, fromGroup: number | undefined) =>
    !filter.tankBlocks(group, fromGroup) && !filter.uniqueBlocks(group, fromGroup, 1);

  const moves: ImproveCandidate[] = [];
  const added: ImproveCandidate[] = [];
  const seen = new Set<string>();
  for (const module of [...modules].sort((a, b) => a.slotIndex - b.slotIndex)) {
    const { slot, slotIndex, typeId: fromTypeId } = module;
    const mutated = isMutated(module);
    if (mutated && !allowMutated) continue;
    const copyKey = `${slot}:${fromTypeId}${mutated ? `@${slotIndex}` : ''}`;
    if (!filter.usesRack(slot) || seen.has(copyKey)) continue;
    seen.add(copyKey);
    const from = groupOf(fromTypeId);
    const offered = new Set<number>([fromTypeId]);
    const offerGroups = (groups: Iterable<number>, into: ImproveCandidate[]) => {
      for (const group of groups) {
        if (filter.losesJob(group, from, 1) || !allowed(group, from)) continue;
        for (const toTypeId of representatives(group, slot)) {
          if (offered.has(toTypeId) || filter.kindBlocks(toTypeId, fromTypeId)) continue;
          offered.add(toTypeId);
          into.push({
            fromTypeId,
            toTypeId,
            at: [{ slot, slotIndex }],
            ...(mutated ? { losesRoll: true } : {}),
          });
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
            if (offered.has(toTypeId) || filter.kindBlocks(toTypeId, null)) continue;
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

export interface PropulsionStart {
  tiers: (fitting: Fitting) => ImproveCandidate[][];
  isPropulsion: (typeId: number) => boolean;
  job: ImproveJob;
}

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

export function propulsionStart(
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  {
    goal,
    defense,
    includeRigs,
    allowMutated,
    pool,
    slotCounts,
    jobSetting,
    commonality,
  }: MakeoverMoveOptions
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
        .filter((m) => m.slot === 'medium' && (allowMutated || !isMutated(m)))
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
              ...(isMutated(module) ? { losesRoll: true } : {}),
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

export const MAKEOVER_CALCS = 600;
const LAZY_MARGIN = 0.01;
const PAIR_SEEDS = 8;
const PAIRS_TRIED = 10;
const BEATS_SINGLE = 0.05;

export interface FindMakeoverParams {
  fitting: Fitting;
  before: FittingStats;
  goal: ImproveGoal;
  moves: (fitting: Fitting) => readonly ImproveCandidate[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  target?: TargetProfile;
  hold?: ImproveHold;
  jobSetting?: JobSetting;
  iskBudget?: number | null;
  fitTotal?: number | null;
  bestSingle?: number | null;
  maxCalcs?: number;
  concurrency?: number;
  lazy?: boolean;
  pairKick?: boolean;
  targetShare?: (move: ImproveCandidate) => number;
  propulsion?: PropulsionStart | null;
  onProgress?: (calcs: number, max: number) => void;
  isCancelled?: () => boolean;
  shouldStop?: () => boolean;
}

export interface Makeover {
  rows: ImproveCandidate[];
  fitting: Fitting;
  after: FittingStats;
  score: number;
  iskDelta: number | null;
  lost: LostStat[];
}

export interface MakeoverSearch {
  makeover: Makeover | null;
  calcs: number;
  stopped: boolean;
}

interface Trial {
  move: ImproveCandidate;
  fitting: Fitting;
  after: FittingStats;
  score: number | null;
  ok: boolean;
}

interface MoveRecord {
  fromTypeId: number | null;
  toTypeId: number;
  rack: FittingSlotKind;
  gain: number;
  freed?: Readonly<Record<Resource, number>>;
}

const moveKey = (fromTypeId: number | null, toTypeId: number, rack: FittingSlotKind) =>
  `${fromTypeId ?? '-'}>${toTypeId}>${rack}`;
const keyOf = (move: ImproveCandidate) => moveKey(move.fromTypeId, move.toTypeId, move.at[0].slot);
const sameSlot = (a: ImproveCandidate, b: ImproveCandidate) =>
  a.at.some((x) => b.at.some((y) => x.slot === y.slot && x.slotIndex === y.slotIndex));
const addIsk = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

class SearchHalt {
  constructor(readonly cancelled: boolean) {}
}

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

  const mayStart = () => !isCancelled?.() && !shouldStop?.() && calcs < maxCalcs - 1;

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
      if (!run || isCancelled?.() || shouldStop?.()) throw new SearchHalt(!!isCancelled?.());
      started.delete(index);
      const after = await run.after;
      if (isCancelled?.()) throw new SearchHalt(true);
      onProgress?.(Math.min(calcs, maxCalcs), maxCalcs);
      take(settle(move, run.moved, after));
    }
    await Promise.all([...started.values()].map((run) => run.after));
  }

  const gainOf = (trial: Trial | null) => (trial?.score ?? -Infinity) - score;

  const trialBeats = (trial: Trial, best: Trial): boolean => {
    if (targetShare && withinTie(gainOf(trial), gainOf(best))) {
      const common = targetShare(trial.move) - targetShare(best.move);
      if (common !== 0) return common > 0;
    }
    return gainOf(trial) > gainOf(best);
  };

  const placed = new Set<string>();
  const slotKey = (at: { slot: FittingSlotKind; slotIndex: number }) =>
    `${at.slot}:${at.slotIndex}`;

  const undoesTieBreak = (trial: Trial): boolean => {
    if (!targetShare || trial.move.fromTypeId === null || !withinTie(score + gainOf(trial), score))
      return false;
    return (
      trial.move.at.every((at) => placed.has(slotKey(at))) &&
      targetShare(trial.move) < targetShare({ ...trial.move, toTypeId: trial.move.fromTypeId })
    );
  };

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

  async function round(first: boolean) {
    const list = [...moves(fitting)];
    const bound = (move: ImproveCandidate) => records.get(keyOf(move))?.gain ?? Infinity;
    if (lazy) list.sort((a, b) => bound(b) - bound(a));
    pending.clear();
    const overran: Trial[] = [];
    await evaluate(
      list,
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
    const interrupted = pending.get();
    if (interrupted && gainOf(interrupted) > minGain) applyStep(interrupted);
  }

  if (steps === 0) return { makeover: null, calcs, stopped };
  const rows = rowsBetween(original, fitting);
  const forcedRow =
    propulsion && forced
      ? rows.find(
          (row) =>
            row.at[0]?.slot === forced!.slot &&
            propulsion.isPropulsion(row.toTypeId) &&
            (row.fromTypeId === null || !propulsion.isPropulsion(row.fromTypeId))
        )
      : undefined;
  if (forcedRow && propulsion) forcedRow.addsPropulsionFor = propulsion.job;
  if (rows.length < 2 && !forcedRow) return { makeover: null, calcs, stopped };
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
    (forcedRow !== undefined ||
      total - single > Math.max(EPSILON, BEATS_SINGLE * Math.abs(single)));
  return {
    makeover: beats
      ? { rows, fitting: remade, after, score: total, iskDelta, lost: lostStats(before, after) }
      : null,
    calcs,
    stopped,
  };
}

export function rowsBetween(from: Fitting, to: Fitting): ImproveCandidate[] {
  const rows = new Map<string, ImproveCandidate>();
  const rolled = new Set(from.modules.filter(isMutated).map(placeKey));
  const add = (fromTypeId: number | null, toTypeId: number, where: ModuleAt) => {
    const lost = fromTypeId !== null && rolled.has(placeKey(where));
    const key = `${fromTypeId ?? '-'}>${toTypeId}${lost ? `@${placeKey(where)}` : ''}`;
    const row = rows.get(key);
    if (row) row.at.push(where);
    else rows.set(key, { fromTypeId, toTypeId, at: [where], ...(lost ? { losesRoll: true } : {}) });
  };
  const racks = new Set([...from.modules, ...to.modules].map((m) => m.slot));
  for (const rack of racks) {
    const typeAt = (fitting: Fitting) =>
      new Map(fitting.modules.filter((m) => m.slot === rack).map((m) => [m.slotIndex, m.typeId]));
    const was = typeAt(from);
    const now = typeAt(to);
    const changed = [...new Set([...was.keys(), ...now.keys()])]
      .filter((index) => was.get(index) !== now.get(index))
      .sort((a, b) => a - b);
    const gained = changed.flatMap((index) => (now.has(index) ? [now.get(index)!] : []));
    const removed: number[] = [];
    for (const index of changed) {
      const typeId = was.get(index);
      if (typeId === undefined) continue;
      const moved = gained.indexOf(typeId);
      if (moved >= 0) gained.splice(moved, 1);
      else removed.push(index);
    }
    for (const index of removed) {
      const toTypeId = gained.shift();
      if (toTypeId !== undefined) add(was.get(index)!, toTypeId, { slot: rack, slotIndex: index });
    }
    const empty = changed.filter((index) => !was.has(index) && now.has(index));
    for (const toTypeId of gained) {
      const index = empty.shift();
      if (index !== undefined) add(null, toTypeId, { slot: rack, slotIndex: index });
    }
  }
  return [...rows.values()];
}
