import { brokerFeePct, salesTax, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalNetFees } from './appraisal';
import {
  HOLD_KINDS,
  holdAccepts,
  SPECIALISED_HOLD_KINDS,
  type CargoHold,
  type HoldKind,
} from './cargoHolds';
import {
  HAULING_THRESHOLDS,
  lotEconomics,
  walkInstant,
  walkLadder,
  type LadderLevel,
} from './haulingMarket';
import { roundPriceDown } from './priceTick';

export interface TripCandidate {
  typeId: number;
  name: string;
  unitVolumeM3: number;
  buyLadder: readonly LadderLevel[];
  expectedPrice: number;
  demandCapUnits: number | null;
  destBuyLadder?: readonly LadderLevel[];
  fees?: AppraisalNetFees;
  groupId?: number | null;
  categoryId?: number | null;
}

export interface TripOverride {
  selected?: boolean;
  quantity?: number;
}

export function isOnTrip(overrides: ReadonlyMap<number, TripOverride>, typeId: number): boolean {
  return overrides.get(typeId)?.selected !== false;
}

export type QuantityLimit = 'sales' | 'supply' | 'space' | 'budget' | 'edited' | 'none';

export interface TripLine {
  typeId: number;
  name: string;
  quantity: number;
  volumeM3: number;
  cost: number;
  profit: number;
  maxBuyPrice: number | null;
  selected: boolean;
  limitedBy: QuantityLimit;
  placements: HoldPlacement[];
}

export interface HoldPlacement {
  kind: HoldKind;
  quantity: number;
  volumeM3: number;
}

export interface HoldUse {
  kind: HoldKind;
  capacityM3: number;
  usedM3: number;
}

export const holdsUsedM3 = (holds: readonly HoldUse[]): number =>
  holds.reduce((sum, h) => sum + h.usedM3, 0);

export const holdsCapacityM3 = (holds: readonly HoldUse[]): number =>
  holds.reduce((sum, h) => sum + h.capacityM3, 0);

export interface TripPlan {
  lines: TripLine[];
  totals: { volumeM3: number; cost: number; profit: number; items: number };
  binding: 'space' | 'budget' | 'sales' | null;
  holds: HoldUse[];
}

export interface PlanTripInput {
  candidates: readonly TripCandidate[];
  holds: readonly CargoHold[] | null;
  budgetIsk: number | null;
  fees: AppraisalNetFees;
  overrides: ReadonlyMap<number, TripOverride>;
}

export function profitableDepth(
  candidate: TripCandidate,
  planFees: AppraisalNetFees,
  minMarginPct: number = HAULING_THRESHOLDS.minUnitMarginPct
): number {
  const { accountingLevel, brokerRelationsLevel, standing } = candidate.fees ?? planFees;
  if (candidate.destBuyLadder !== undefined) {
    return walkInstant({
      originLadder: candidate.buyLadder,
      destBuyLadder: candidate.destBuyLadder,
      accountingLevel,
      feeDiscountFactor: standing.feeDiscountFactor,
      minMarginPct,
    }).units;
  }
  const feeRate =
    (salesTaxPct(accountingLevel, standing.feeDiscountFactor) +
      brokerFeePct(
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding,
        standing.safetyTaxPct,
        standing.feeDiscountFactor
      )) /
    100;
  const breakEven = (candidate.expectedPrice * (1 - feeRate)) / (1 + minMarginPct / 100);
  return candidate.buyLadder.reduce((sum, l) => (l.price <= breakEven ? sum + l.units : sum), 0);
}

export function maxBuyPrice(
  candidate: TripCandidate,
  planFees: AppraisalNetFees,
  minMarginPct: number = HAULING_THRESHOLDS.minUnitMarginPct
): number | null {
  const { accountingLevel, brokerRelationsLevel, standing } = candidate.fees ?? planFees;
  if (candidate.destBuyLadder !== undefined) {
    const { units } = walkInstant({
      originLadder: candidate.buyLadder,
      destBuyLadder: candidate.destBuyLadder,
      accountingLevel,
      feeDiscountFactor: standing.feeDiscountFactor,
      minMarginPct,
    });
    if (units <= 0) return null;
    let sold = 0;
    for (const level of candidate.destBuyLadder) {
      sold += level.units;
      if (sold >= units) {
        const net =
          level.price - salesTax(level.price, accountingLevel, standing.feeDiscountFactor);
        const limit = net / (1 + minMarginPct / 100);
        return roundPriceDown(limit) ?? limit;
      }
    }
    return null;
  }
  const feeRate =
    (salesTaxPct(accountingLevel, standing.feeDiscountFactor) +
      brokerFeePct(
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding,
        standing.safetyTaxPct,
        standing.feeDiscountFactor
      )) /
    100;
  const limit = (candidate.expectedPrice * (1 - feeRate)) / (1 + minMarginPct / 100);
  const cheapest = candidate.buyLadder[0]?.price;
  if (cheapest === undefined || cheapest > limit) return null;
  return roundPriceDown(limit) ?? limit;
}

function affordableUnits(ladder: readonly LadderLevel[], budget: number, max: number): number {
  let lo = 0;
  let hi = max;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (walkLadder(ladder, mid).cost <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lineFor(
  candidate: TripCandidate,
  quantity: number,
  selected: boolean,
  limitedBy: QuantityLimit,
  planFees: AppraisalNetFees
): TripLine {
  const economics = lotEconomics({
    buyLadder: candidate.buyLadder,
    expectedPrice: candidate.expectedPrice,
    quantity,
    fees: candidate.fees ?? planFees,
    destBuyLadder: candidate.destBuyLadder,
  });
  return {
    typeId: candidate.typeId,
    name: candidate.name,
    quantity: economics.filled,
    volumeM3: economics.filled * candidate.unitVolumeM3,
    cost: economics.cost,
    profit: economics.profit,
    maxBuyPrice: maxBuyPrice(candidate, planFees),
    selected,
    limitedBy,
    placements: [],
  };
}

const FILL_ORDER: readonly HoldKind[] = [...SPECIALISED_HOLD_KINDS, 'general'];

function holdUses(holds: readonly CargoHold[] | null): HoldUse[] {
  const byKind = new Map<HoldKind, number>();
  for (const { kind, capacityM3 } of holds ?? []) {
    if (capacityM3 > 0) byKind.set(kind, (byKind.get(kind) ?? 0) + capacityM3);
  }
  return HOLD_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    capacityM3: byKind.get(kind)!,
    usedM3: 0,
  }));
}

function eligibleHolds(holds: readonly HoldUse[], candidate: TripCandidate): HoldUse[] {
  const item = { groupId: candidate.groupId ?? null, categoryId: candidate.categoryId ?? null };
  return FILL_ORDER.flatMap((kind) => {
    const hold = holds.find((h) => h.kind === kind);
    return hold !== undefined && holdAccepts(kind, item) ? [hold] : [];
  });
}

const freeM3 = (hold: HoldUse) => Math.max(0, hold.capacityM3 - hold.usedM3);

const unitsIn = (hold: HoldUse, unitVolumeM3: number) =>
  Math.floor(freeM3(hold) / unitVolumeM3 + 1e-9);

function load(eligible: readonly HoldUse[], quantity: number, unitVolumeM3: number) {
  const placements: HoldPlacement[] = [];
  let left = quantity;
  for (const [i, hold] of eligible.entries()) {
    if (left <= 0) break;
    const last = i === eligible.length - 1;
    const units = last || unitVolumeM3 <= 0 ? left : Math.min(left, unitsIn(hold, unitVolumeM3));
    if (units <= 0) continue;
    hold.usedM3 += units * unitVolumeM3;
    placements.push({ kind: hold.kind, quantity: units, volumeM3: units * unitVolumeM3 });
    left -= units;
  }
  return placements;
}

export function planTrip(input: PlanTripInput): TripPlan {
  const { candidates, budgetIsk, fees, overrides } = input;
  const lines = new Map<number, TripLine>();

  const holds = holdUses(input.holds);
  const spaceLimits = holds.length > 0;
  let remainingBudget = budgetIsk;

  const place = (candidate: TripCandidate, line: TripLine): TripLine =>
    spaceLimits && line.quantity > 0
      ? {
          ...line,
          placements: load(eligibleHolds(holds, candidate), line.quantity, candidate.unitVolumeM3),
        }
      : line;

  const auto: TripCandidate[] = [];
  for (const candidate of candidates) {
    const override = overrides.get(candidate.typeId);
    if (override?.selected === false) {
      lines.set(candidate.typeId, lineFor(candidate, 0, false, 'none', fees));
    } else if (override?.quantity !== undefined) {
      const line = place(
        candidate,
        lineFor(candidate, Math.max(0, Math.floor(override.quantity)), true, 'edited', fees)
      );
      lines.set(candidate.typeId, line);
      if (remainingBudget !== null) remainingBudget -= line.cost;
    } else {
      auto.push(candidate);
    }
  }

  const sized = auto.map((candidate) => {
    const supplyCap = profitableDepth(candidate, fees);
    const salesCap =
      candidate.demandCapUnits === null
        ? Infinity
        : Math.max(0, Math.floor(candidate.demandCapUnits));
    const cap = Math.min(salesCap, supplyCap);
    const atCap = lotEconomics({
      buyLadder: candidate.buyLadder,
      expectedPrice: candidate.expectedPrice,
      quantity: cap,
      fees: candidate.fees ?? fees,
      destBuyLadder: candidate.destBuyLadder,
    });
    const usableM3 = eligibleHolds(holds, candidate).reduce((sum, h) => sum + freeM3(h), 0);
    let scarcity = 0;
    if (spaceLimits && usableM3 > 0) {
      scarcity = Math.max(scarcity, (atCap.filled * candidate.unitVolumeM3) / usableM3);
    }
    if (remainingBudget !== null && remainingBudget > 0) {
      scarcity = Math.max(scarcity, atCap.cost / remainingBudget);
    }
    const score = scarcity > 0 ? atCap.profit / scarcity : atCap.profit;
    return {
      candidate,
      cap,
      capLimit: (supplyCap < salesCap ? 'supply' : 'sales') as QuantityLimit,
      score,
    };
  });
  sized.sort((a, b) => b.score - a.score);

  for (const { candidate, cap, capLimit } of sized) {
    let quantity = cap;
    let limitedBy: QuantityLimit = capLimit;

    if (spaceLimits && candidate.unitVolumeM3 > 0) {
      const bySpace = eligibleHolds(holds, candidate).reduce(
        (sum, h) => sum + unitsIn(h, candidate.unitVolumeM3),
        0
      );
      if (bySpace < quantity) {
        quantity = bySpace;
        limitedBy = 'space';
      }
    }
    if (remainingBudget !== null) {
      const byBudget = affordableUnits(candidate.buyLadder, Math.max(0, remainingBudget), quantity);
      if (byBudget < quantity) {
        quantity = byBudget;
        limitedBy = 'budget';
      }
    }

    let sizedLine = lineFor(candidate, quantity, true, limitedBy, fees);
    if (sizedLine.quantity > 0 && sizedLine.profit <= 0) {
      sizedLine = lineFor(candidate, 0, true, limitedBy, fees);
    }
    const line = place(candidate, sizedLine);
    lines.set(candidate.typeId, line);
    if (remainingBudget !== null) remainingBudget -= line.cost;
  }

  const ordered = candidates.map((c) => lines.get(c.typeId)!);
  const shipped = ordered.filter((l) => l.quantity > 0);
  const autoLines = ordered.filter((l) => l.limitedBy !== 'edited' && l.limitedBy !== 'none');
  const binding = autoLines.some((l) => l.limitedBy === 'space')
    ? 'space'
    : autoLines.some((l) => l.limitedBy === 'budget')
      ? 'budget'
      : autoLines.some((l) => l.limitedBy === 'sales')
        ? 'sales'
        : null;

  return {
    lines: ordered,
    totals: {
      volumeM3: shipped.reduce((s, l) => s + l.volumeM3, 0),
      cost: shipped.reduce((s, l) => s + l.cost, 0),
      profit: shipped.reduce((s, l) => s + l.profit, 0),
      items: shipped.length,
    },
    binding,
    holds,
  };
}

export function multibuyText(lines: readonly { name: string; quantity: number }[]): string {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => `${l.name} ${l.quantity}`)
    .join('\n');
}
