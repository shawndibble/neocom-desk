import { sum as sumAll } from '../math';
import type { PiData } from '@/sde/types';
import { estimateChain } from './chainEstimate';
import { baselineTotal } from './baseline';
import { haulingOf } from './goalPlanSteps/flows';
import type { JumpsFn, PlannerColony, PlannerPolicy, PriceBooks } from './goalTypes';
import { HOURS_PER_DAY } from './planAdvice';
import { salesCapPerDay, thinSales, type ThinSales } from './salesCap';

export interface AccountPlanInput {
  colonies: readonly PlannerColony[];
  policy: PlannerPolicy;
  books: PriceBooks;
  jumps?: JumpsFn;
  candidates: readonly number[];
  haul: boolean;
  soloPerDay?: ReadonlyMap<number, number | null>;
  hubTradesPerDay?: ReadonlyMap<number, number>;
  pi: PiData;
}

export interface AccountLeg {
  from: number;
  to: number;
  jumps: number | null;
}

export interface AccountGroup {
  typeId: number | null;
  planetIds: number[];
  iskPerDay: number;
  apartPerDay: number;
  gainPerDay: number;
  unitsPerDay: number;
  hostId: number | null;
  m3PerWeek: number;
  legs: AccountLeg[];
  buys: boolean;
  thin: ThinSales | null;
}

export interface AccountPlan {
  groups: AccountGroup[];
  totalPerDay: number;
  apartTotalPerDay: number;
  buyGainPerDay: number;
  haulGainPerDay: number;
  unknownPlanetIds: number[];
}

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
  thin: ThinSales | null;
}

function chainOnColonies(
  typeId: number,
  colonies: readonly PlannerColony[],
  allowBuy: boolean,
  ctx: Pick<AccountPlanInput, 'policy' | 'books' | 'jumps' | 'pi' | 'hubTradesPerDay'>
): Chain | null {
  const { policy, books, jumps, pi } = ctx;
  const trades = ctx.hubTradesPerDay?.get(typeId);
  const cap = salesCapPerDay(trades);
  const result = estimateChain(
    {
      typeId,
      colonies,
      policy,
      books,
      allowBuy,
      ...(jumps ? { jumps } : {}),
      ...(cap === undefined ? {} : { salesCapPerDay: new Map([[typeId, cap]]) }),
    },
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
    thin: thinSales(result.unitsPerDay, trades),
  };
}

const sum = (ids: readonly number[], figure: ReadonlyMap<number, number>) =>
  ids.reduce((total, id) => total + (figure.get(id) ?? 0), 0);
const totalOf = (figure: ReadonlyMap<number, number>) => sumAll([...figure.values()]);

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
    thin: chain.thin,
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
    thin: null,
  };
}

export function* planAccount(
  input: AccountPlanInput
): Generator<AccountProgress, AccountPlan, void> {
  const { colonies, policy, books, jumps, candidates, pi, hubTradesPerDay } = input;
  const ctx = { policy, books, jumps, pi, hubTradesPerDay };
  const buying = policy.buyTiers.length > 0;

  const baseline = baselineTotal(colonies, pi, policy, books, jumps);
  const ownFigure = (c: PlannerColony): number | null => {
    const given = input.soloPerDay?.get(c.planetId);
    if (given !== undefined) return given;
    const own = baseline.perColony.get(c.planetId);
    if (own?.status === 'ok') return own.iskPerHour * HOURS_PER_DAY;
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
  const known = colonies.filter((c) => apart.has(c.planetId));

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
