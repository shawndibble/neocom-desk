import { walkSellBook } from '@/engine/industry/depthPrice';
import type { SkillLevels } from '@/engine/industry/types';
import { walkSellIntoBuys, type ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import type { ResolvedStandings } from '@/engine/market/standings';
import { capListedPrice } from '@/engine/market/tradedPriceCheck';
import type { LpRate } from './marketLpValue';
import { loyaltyOfferProfit } from './offerProfit';

export const FALLBACK_FLOOR_SHARE = 0.7;

export interface SpendCandidate {
  offerId: number;
  lpCost: number;
  iskCost: number;
  buildCost: number;
  requiredItems: readonly { typeId: number; quantity: number }[];
  outputTypeId: number | null;
  outputUnits: number | null;
  outputPriceCeiling?: number | null;
}

export interface SpendPlanInput {
  candidates: readonly SpendCandidate[];
  lpBalance: number;
  walletBalance: number | null;
  lpValue: LpRate;
  stationId: number;
  sellBooks: ReadonlyMap<number, readonly HubOrder[]>;
  buyBooks: ReadonlyMap<number, readonly ReachableBuyOrder[]>;
  owned: ReadonlyMap<number, number>;
  skills: SkillLevels;
  standing?: ResolvedStandings;
}

export type SpendStopReason = 'lpExhausted' | 'nothingProfitable' | 'belowFloor' | 'wallet';

export type SpendFloor =
  { rate: number; source: 'yours' | 'market' } | { rate: number; source: 'best'; best: number };

function bestShareFloor(best: number): SpendFloor {
  return { rate: FALLBACK_FLOOR_SHARE * best, source: 'best', best };
}

export interface SpendStop {
  reason: SpendStopReason;
  offerId: number | null;
  iskPerLp: number | null;
  floor: SpendFloor | null;
}

export interface SpendTurnIn {
  typeId: number;
  owned: number;
  bought: number;
}

export interface SpendPlanRow {
  offerId: number;
  redemptions: number;
  lpSpent: number;
  iskCost: number;
  turnInsCost: number;
  turnIns: SpendTurnIn[];
  revenue: number;
  salesTax: number;
  income: number;
  profit: number;
}

export interface SpendPlanTotals {
  lpSpent: number;
  iskCost: number;
  turnInsCost: number;
  purchases: number;
  revenue: number;
  salesTax: number;
  income: number;
  profit: number;
}

export interface SpendPlanResult {
  rows: SpendPlanRow[];
  totals: SpendPlanTotals;
  lpLeft: number;
  iskPerLp: number | null;
  stop: SpendStop;
  unpriced: number[];
}

interface Step {
  candidate: SpendCandidate;
  turnIns: SpendTurnIn[];
  turnInsCost: number;
  revenue: number;
  salesTax: number;
  income: number;
  profit: number;
  iskPerLp: number;
}

function needsOf(candidate: SpendCandidate): Map<number, number> {
  const needs = new Map<number, number>();
  for (const item of candidate.requiredItems) {
    needs.set(item.typeId, (needs.get(item.typeId) ?? 0) + item.quantity);
  }
  return needs;
}

export function planLpSpend(input: SpendPlanInput): SpendPlanResult {
  const { stationId } = input;
  const used = new Map<number, number>();
  const sold = new Map<number, number>();

  const buyCost = new Map<string, number | null>();
  const costOf = (typeId: number, units: number): number | null => {
    if (units <= 0) return 0;
    const key = `${typeId}:${units}`;
    const cached = buyCost.get(key);
    if (cached !== undefined) return cached;
    const book = input.sellBooks.get(typeId);
    const walk = book === undefined ? null : walkSellBook(book, stationId, units);
    const cost = walk === null || !walk.covered ? null : walk.avg * walk.filled;
    buyCost.set(key, cost);
    return cost;
  };

  const cappedBooks = new Map<string, readonly ReachableBuyOrder[]>();
  const saleRevenue = new Map<string, number>();
  const revenueOf = (
    typeId: number,
    ceiling: number | null,
    units: number,
    book: readonly ReachableBuyOrder[]
  ): number => {
    if (units <= 0) return 0;
    const bookKey = `${typeId}:${ceiling ?? ''}`;
    let bids = cappedBooks.get(bookKey);
    if (bids === undefined) {
      bids =
        ceiling === null
          ? book
          : book.map((order) => ({ ...order, price: capListedPrice(order.price, ceiling).price }));
      cappedBooks.set(bookKey, bids);
    }
    const key = `${bookKey}:${units}`;
    const cached = saleRevenue.get(key);
    if (cached !== undefined) return cached;
    const revenue = walkSellIntoBuys(bids, units).revenue;
    saleRevenue.set(key, revenue);
    return revenue;
  };

  const stepOf = (candidate: SpendCandidate): Step | null => {
    const turnIns: SpendTurnIn[] = [];
    let turnInsCost = 0;
    for (const [typeId, quantity] of needsOf(candidate)) {
      const owned = input.owned.get(typeId) ?? 0;
      const before = used.get(typeId) ?? 0;
      const after = before + quantity;
      const boughtBefore = Math.max(0, before - owned);
      const boughtAfter = Math.max(0, after - owned);
      const costBefore = costOf(typeId, boughtBefore);
      const costAfter = costOf(typeId, boughtAfter);
      if (costBefore === null || costAfter === null) return null;
      turnInsCost += costAfter - costBefore;
      turnIns.push({
        typeId,
        owned: Math.min(after, owned) - Math.min(before, owned),
        bought: boughtAfter - boughtBefore,
      });
    }
    const { outputTypeId, outputUnits } = candidate;
    if (outputTypeId === null || outputUnits === null || outputUnits <= 0) return null;
    const book = input.buyBooks.get(outputTypeId);
    if (book === undefined) return null;
    const ceiling = candidate.outputPriceCeiling ?? null;
    const soldBefore = sold.get(outputTypeId) ?? 0;
    const revenue =
      revenueOf(outputTypeId, ceiling, soldBefore + outputUnits, book) -
      revenueOf(outputTypeId, ceiling, soldBefore, book);
    const profit = loyaltyOfferProfit({
      iskCost: candidate.iskCost,
      lpCost: candidate.lpCost,
      requiredItemsCost: turnInsCost,
      revenue,
      buildCost: candidate.buildCost,
      playerLp: null,
      liquidationBasis: 'instant',
      skills: input.skills,
      standing: input.standing,
    });
    if (profit.profit === null || profit.iskPerLp === null) return null;
    return {
      candidate,
      turnIns,
      turnInsCost,
      revenue,
      salesTax: profit.salesTax ?? 0,
      income: profit.netRevenue ?? revenue,
      profit: profit.profit,
      iskPerLp: profit.iskPerLp,
    };
  };

  const rows = new Map<number, SpendPlanRow>();
  const unpriced: number[] = [];
  let alive = input.candidates.filter((c) => c.lpCost > 0);
  let lpLeft = Math.max(0, input.lpBalance);
  let purchases = 0;
  let best = -Infinity;
  const steps = new Map<SpendCandidate, Step | null>();
  let stop: SpendStop;

  for (;;) {
    let next: Step | null = null;
    let outOfReach: Step | null = null;
    let overWallet: Step | null = null;
    for (const candidate of alive) {
      if (!steps.has(candidate)) steps.set(candidate, stepOf(candidate));
      const step = steps.get(candidate) ?? null;
      if (step === null) continue;
      if (candidate.lpCost > lpLeft) {
        if (outOfReach === null || step.iskPerLp > outOfReach.iskPerLp) outOfReach = step;
      } else if (
        input.walletBalance !== null &&
        purchases + purchaseOf(step) > input.walletBalance
      ) {
        if (overWallet === null || step.iskPerLp > overWallet.iskPerLp) overWallet = step;
      } else if (next === null || step.iskPerLp > next.iskPerLp) next = step;
    }
    const dead = alive.filter((c) => steps.get(c) === null);
    for (const c of dead) unpriced.push(c.offerId);
    alive = alive.filter((c) => steps.get(c) !== null);

    const head = next ?? overWallet;
    if (head === null) {
      stop =
        outOfReach === null
          ? { reason: 'nothingProfitable', offerId: null, iskPerLp: null, floor: null }
          : {
              reason: 'lpExhausted',
              offerId: outOfReach.candidate.offerId,
              iskPerLp: outOfReach.iskPerLp,
              floor: null,
            };
      break;
    }
    const at = { offerId: head.candidate.offerId, iskPerLp: head.iskPerLp };
    if (head.profit <= 0) {
      stop = { reason: 'nothingProfitable', ...at, floor: null };
      break;
    }
    const floor: SpendFloor =
      input.lpValue.rate !== null &&
      input.lpValue.rate > 0 &&
      (input.lpValue.source === 'yours' || input.lpValue.source === 'market')
        ? { rate: input.lpValue.rate, source: input.lpValue.source }
        : bestShareFloor(Math.max(best, head.iskPerLp));
    if (head.iskPerLp < floor.rate) {
      stop = { reason: 'belowFloor', ...at, floor };
      break;
    }
    if (next === null) {
      stop = { reason: 'wallet', ...at, floor: null };
      break;
    }
    commit(next);
    purchases += purchaseOf(next);
    lpLeft -= next.candidate.lpCost;
    best = Math.max(best, next.iskPerLp);
    const touched = typesOf(next.candidate);
    for (const candidate of alive) {
      if (typesOf(candidate).some((t) => touched.includes(t))) steps.delete(candidate);
    }
  }

  function commit(step: Step): void {
    const { candidate } = step;
    for (const turnIn of step.turnIns) {
      used.set(turnIn.typeId, (used.get(turnIn.typeId) ?? 0) + turnIn.owned + turnIn.bought);
    }
    const outputTypeId = candidate.outputTypeId!;
    sold.set(outputTypeId, (sold.get(outputTypeId) ?? 0) + candidate.outputUnits!);
    const row = rows.get(candidate.offerId) ?? {
      offerId: candidate.offerId,
      redemptions: 0,
      lpSpent: 0,
      iskCost: 0,
      turnInsCost: 0,
      turnIns: [],
      revenue: 0,
      salesTax: 0,
      income: 0,
      profit: 0,
    };
    row.redemptions += 1;
    row.lpSpent += candidate.lpCost;
    row.iskCost += candidate.iskCost + candidate.buildCost;
    row.turnInsCost += step.turnInsCost;
    row.revenue += step.revenue;
    row.salesTax += step.salesTax;
    row.income += step.income;
    row.profit += step.profit;
    for (const turnIn of step.turnIns) {
      const line = row.turnIns.find((t) => t.typeId === turnIn.typeId);
      if (line) {
        line.owned += turnIn.owned;
        line.bought += turnIn.bought;
      } else row.turnIns.push({ ...turnIn });
    }
    rows.set(candidate.offerId, row);
  }

  const planRows = [...rows.values()];
  const total = (pick: (row: SpendPlanRow) => number): number =>
    planRows.reduce((sum, row) => sum + pick(row), 0);
  const totals: SpendPlanTotals = {
    lpSpent: total((r) => r.lpSpent),
    iskCost: total((r) => r.iskCost),
    turnInsCost: total((r) => r.turnInsCost),
    purchases: total((r) => r.iskCost + r.turnInsCost),
    revenue: total((r) => r.revenue),
    salesTax: total((r) => r.salesTax),
    income: total((r) => r.income),
    profit: total((r) => r.profit),
  };
  return {
    rows: planRows,
    totals,
    lpLeft: Math.max(0, input.lpBalance) - totals.lpSpent,
    iskPerLp: totals.lpSpent > 0 ? totals.profit / totals.lpSpent : null,
    stop,
    unpriced,
  };
}

function purchaseOf(step: Step): number {
  return step.candidate.iskCost + step.candidate.buildCost + step.turnInsCost;
}

function typesOf(candidate: SpendCandidate): number[] {
  const types = candidate.requiredItems.map((item) => item.typeId);
  if (candidate.outputTypeId !== null) types.push(candidate.outputTypeId);
  return types;
}
