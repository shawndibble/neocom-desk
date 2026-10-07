/**
 * The whole-account plan: what every colony should do so the pilot's planets,
 * together, earn the most ISK a day.
 *
 * The Goal Planner answers "make this product". This answers the question the
 * pilot actually has: "what is the best use of all my planets?". It is a split
 * of the colonies into groups, never one solver call:
 *
 * - a **group** is one chain over some of the colonies (a capacity search,
 *   `estimateChain`), or one colony on its own best pick;
 * - a colony no group wants stays on its own best pick;
 * - the total is the sum of the groups.
 *
 * Three stages, each built on the last, so the plan can say what each choice
 * the pilot made is worth:
 *
 * 1. **Apart**: every colony on its own best pick (`soloPerDay`), nothing
 *    bought. This is the one-planet answer.
 * 2. **Buying**: when the pilot will buy some tiers at the hub, each colony may
 *    instead run any candidate product alone from bought inputs. The best of
 *    that and stage 1.
 * 3. **Hauling**: when the pilot hauls between planets, greedy rounds. For each
 *    candidate product, plan the chain over the colonies still free; its gain
 *    is what the colonies it uses earn under it, less what they earn at the end
 *    of stage 2 (never their Baseline, never the unused colonies the solver
 *    also credits). Take the biggest positive gain, lock its colonies, repeat.
 *
 * A chain with no positive gain is never taken, so every figure the plan shows
 * is at least what the colonies make apart.
 *
 * Greedy, not exact: it does not prove the best split, and two splits within
 * the solver's tolerance are the same plan. It is a generator so a caller can
 * run it in slices between frames; each `yield` is one solver search finished.
 *
 * Pure: colonies, policy, prices, jumps and `PiData` are parameters.
 */
import type { PiData } from '@/sde/types';
import { estimateChain } from './chainEstimate';
import { baselineTotal } from './baseline';
import { haulingOf } from './goalPlanSteps/flows';
import type { JumpsFn, PlannerColony, PlannerPolicy, PriceBooks } from './goalTypes';
import { HOURS_PER_DAY } from './planAdvice';

export interface AccountPlanInput {
  colonies: readonly PlannerColony[];
  /** `buyTiers` is what the pilot will buy at the hub. */
  policy: PlannerPolicy;
  books: PriceBooks;
  jumps?: JumpsFn;
  /** Products worth trying. The caller narrows these: each costs a solver search. */
  candidates: readonly number[];
  /** Plan chains across colonies (the pilot hauls between planets). */
  haul: boolean;
  /**
   * What each colony earns a day on its own best pick today. Defaults to its
   * Baseline (its best P1 sale); a caller with a better one-planet figure
   * (after quick wins and rebuild) passes it.
   */
  soloPerDay?: ReadonlyMap<number, number | null>;
  pi: PiData;
}

/** One haul between two of a group's colonies. */
export interface AccountLeg {
  from: number;
  to: number;
  /** Gate jumps, null when not known. */
  jumps: number | null;
}

export interface AccountGroup {
  /** The product the group makes; null for a colony left on its own best pick. */
  typeId: number | null;
  /** Colonies the group uses, ascending. */
  planetIds: number[];
  /** What the group earns a day, after customs and sales tax. */
  iskPerDay: number;
  /** What the same colonies earn apart. */
  apartPerDay: number;
  /** `iskPerDay − apartPerDay`. Zero for a colony left alone. */
  gainPerDay: number;
  unitsPerDay: number;
  /** The colony the factories sit on; null for a colony left alone. */
  hostId: number | null;
  m3PerWeek: number;
  legs: AccountLeg[];
  /** The group buys some of its inputs at the hub. */
  buys: boolean;
}

export interface AccountPlan {
  groups: AccountGroup[];
  totalPerDay: number;
  /** Stage 1: every colony on its own best pick. */
  apartTotalPerDay: number;
  /** What buying at the hub adds on top of stage 1; 0 when nothing is bought. */
  buyGainPerDay: number;
  /** What hauling between planets adds on top of stage 2; 0 when the pilot does not haul. */
  haulGainPerDay: number;
  /** Colonies with no one-planet figure: counted as zero, never guessed. */
  unknownPlanetIds: number[];
}

/** One solver search finished, so a caller can yield the thread. */
export interface AccountProgress {
  stage: 'buying' | 'hauling';
  typeId: number;
}

interface Chain {
  typeId: number;
  planetIds: number[];
  iskPerDay: number;
  unitsPerDay: number;
  hostId: number;
  m3PerWeek: number;
  legs: AccountLeg[];
  buys: boolean;
}

/** The chain over `colonies`, and only the colonies it uses; null with no plan or no price. */
function chainOnColonies(
  typeId: number,
  colonies: readonly PlannerColony[],
  allowBuy: boolean,
  ctx: Pick<AccountPlanInput, 'policy' | 'books' | 'jumps' | 'pi'>
): Chain | null {
  const { policy, books, jumps, pi } = ctx;
  const result = estimateChain(
    { typeId, colonies, policy, books, allowBuy, ...(jumps ? { jumps } : {}) },
    pi
  );
  if (result.status !== 'estimated') return null;
  const { plan, economics } = result.best;
  const hostId = plan.factoryHost?.planetId;
  if (hostId === undefined || economics.status !== 'costed') return null;
  const used = new Set(
    plan.assignments
      .filter((a) => a.role === 'extract' || a.role === 'factory')
      .map((a) => a.planetId)
  );
  used.add(hostId);
  const touches = plan.flows.filter(
    (f) => (f.from !== 'hub' && used.has(f.from)) || (f.to !== 'hub' && used.has(f.to))
  );
  let iskPerHour = 0;
  for (const id of used) iskPerHour += economics.perColony.get(id)?.planIskPerHour ?? 0;
  const legs = new Map<string, AccountLeg>();
  for (const f of touches) {
    if (f.from === 'hub' || f.to === 'hub' || f.from === f.to) continue;
    const key = `${f.from}-${f.to}`;
    if (!legs.has(key)) legs.set(key, { from: f.from, to: f.to, jumps: f.jumps ?? null });
  }
  return {
    typeId,
    planetIds: [...used].sort((a, b) => a - b),
    iskPerDay: iskPerHour * HOURS_PER_DAY,
    unitsPerDay: result.unitsPerDay,
    hostId,
    m3PerWeek: haulingOf(touches, pi).m3PerWeek,
    legs: [...legs.values()].sort((a, b) => a.from - b.from || a.to - b.to),
    buys: allowBuy && touches.some((f) => f.from === 'hub'),
  };
}

const sum = (ids: readonly number[], figure: ReadonlyMap<number, number>) =>
  ids.reduce((total, id) => total + (figure.get(id) ?? 0), 0);
const totalOf = (figure: ReadonlyMap<number, number>) =>
  [...figure.values()].reduce((a, b) => a + b, 0);

function groupOf(chain: Chain, apartPerDay: number): AccountGroup {
  return {
    typeId: chain.typeId,
    planetIds: chain.planetIds,
    iskPerDay: chain.iskPerDay,
    apartPerDay,
    gainPerDay: chain.iskPerDay - apartPerDay,
    unitsPerDay: chain.unitsPerDay,
    hostId: chain.hostId,
    m3PerWeek: chain.m3PerWeek,
    legs: chain.legs,
    buys: chain.buys,
  };
}

function aloneGroup(planetId: number, perDay: number): AccountGroup {
  return {
    typeId: null,
    planetIds: [planetId],
    iskPerDay: perDay,
    apartPerDay: perDay,
    gainPerDay: 0,
    unitsPerDay: 0,
    hostId: null,
    m3PerWeek: 0,
    legs: [],
    buys: false,
  };
}

export function* planAccount(
  input: AccountPlanInput
): Generator<AccountProgress, AccountPlan, void> {
  const { colonies, policy, books, jumps, candidates, pi } = input;
  const ctx = { policy, books, jumps, pi };
  const buying = policy.buyTiers.length > 0;

  // Stage 1: each colony on its own best pick.
  const baseline = baselineTotal(colonies, pi, policy, books, jumps);
  const ownFigure = (c: PlannerColony): number | null => {
    const given = input.soloPerDay?.get(c.planetId);
    if (given !== undefined) return given;
    const own = baseline.perColony.get(c.planetId);
    if (own?.status === 'ok') return own.iskPerHour * HOURS_PER_DAY;
    // Nothing fits earns nothing, which is a figure; an unpriced P1 is not.
    return own?.status === 'nothing-fits' ? 0 : null;
  };
  const unknown: number[] = [];
  const apart = new Map<number, number>();
  for (const c of colonies) {
    const figure = ownFigure(c);
    if (figure === null) unknown.push(c.planetId);
    else apart.set(c.planetId, figure);
  }
  const apartTotal = totalOf(apart);
  // A colony with no own figure has nothing to compare a chain against: it is
  // left out of the search, never counted as earning zero and so "gaining" all it makes.
  const known = colonies.filter((c) => apart.has(c.planetId));

  // Stage 2: one colony alone, buying inputs. The best of that and apart.
  const solo = new Map<number, Chain>();
  const soloFigure = new Map(apart);
  if (buying) {
    for (const c of known) {
      for (const typeId of candidates) {
        const chain = chainOnColonies(typeId, [c], true, ctx);
        yield { stage: 'buying', typeId };
        if (chain && chain.iskPerDay > soloFigure.get(c.planetId)!) {
          solo.set(c.planetId, chain);
          soloFigure.set(c.planetId, chain.iskPerDay);
        }
      }
    }
  }
  const afterBuying = totalOf(soloFigure);

  // Stage 3: chains across colonies, biggest gain first.
  const taken: Chain[] = [];
  const locked = new Set<number>();
  if (input.haul) {
    for (;;) {
      const free = known.filter((c) => !locked.has(c.planetId));
      if (free.length < 2) break;
      let best: { chain: Chain; gain: number } | null = null;
      for (const typeId of candidates) {
        const chain = chainOnColonies(typeId, free, buying, ctx);
        yield { stage: 'hauling', typeId };
        if (!chain || chain.planetIds.length < 2) continue;
        const gain = chain.iskPerDay - sum(chain.planetIds, soloFigure);
        if (gain > 0 && (best === null || gain > best.gain)) best = { chain, gain };
      }
      if (best === null) break;
      taken.push(best.chain);
      for (const id of best.chain.planetIds) locked.add(id);
    }
  }

  const groups: AccountGroup[] = taken.map((chain) =>
    groupOf(chain, sum(chain.planetIds, soloFigure))
  );
  for (const c of colonies) {
    if (locked.has(c.planetId)) continue;
    const chain = solo.get(c.planetId);
    const own = apart.get(c.planetId) ?? 0;
    groups.push(
      chain ? groupOf({ ...chain, planetIds: [c.planetId] }, own) : aloneGroup(c.planetId, own)
    );
  }
  groups.sort((a, b) => b.iskPerDay - a.iskPerDay || a.planetIds[0] - b.planetIds[0]);
  const totalPerDay = groups.reduce((total, g) => total + g.iskPerDay, 0);
  return {
    groups,
    totalPerDay,
    apartTotalPerDay: apartTotal,
    buyGainPerDay: afterBuying - apartTotal,
    haulGainPerDay: totalPerDay - afterBuying,
    unknownPlanetIds: unknown,
  };
}
