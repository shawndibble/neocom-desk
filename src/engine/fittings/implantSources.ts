/**
 * Where the Implant Finder can get an implant or booster, best first: sell
 * orders at a Trade Hub, and LP Store offers priced at ISK + LP × the
 * store's **LP Value** + the turn-ins (pirate tags and the like) the pilot
 * doesn't already own, bought at their Trade Hub. What the pilot can actually
 * use comes first; an LP offer whose LP nothing prices sits after it,
 * unpriced; one they can't redeem — too little LP, or a turn-in nobody sells
 * — comes last, so it can still say what it would have cost.
 */
import { pickSource, type HubPrice } from './implantFinder';

export interface LpOfferInput {
  corporationId: number;
  corpName: string;
  iskCost: number;
  lpCost: number;
  /** Units one redemption hands out. */
  quantity: number;
  requiredItems: readonly { typeId: number; quantity: number }[];
}

export interface SourceContext {
  /** The Trade Hub the pilot buys at. */
  selectedHubId: string;
  /** Sell orders for an item at every Trade Hub. */
  hubPrices: (typeId: number) => readonly HubPrice[];
  /** A turn-in's sell price at the pilot's Trade Hub; null when nobody sells it there. */
  turnInPrice: (typeId: number) => number | null;
  /** ISK per LP a store's LP is priced at (`lpRate`); null when nothing prices it. */
  lpRate: (corporationId: number) => number | null;
  /** The pilot's LP with a store; null when it can't be read. */
  lpBalance: (corporationId: number) => number | null;
  /** Units of an item the pilot owns. */
  owned: (typeId: number) => number;
}

export interface TurnIn {
  typeId: number;
  quantity: number;
  owned: number;
  toBuy: number;
  unitPrice: number | null;
}

export type Source =
  | {
      kind: 'market';
      hubId: string;
      atSelectedHub: boolean;
      price: number;
      volume: number;
      /** Per unit. */
      cost: number;
    }
  | {
      kind: 'lp';
      corporationId: number;
      corpName: string;
      iskCost: number;
      lpCost: number;
      quantity: number;
      lpRate: number | null;
      turnIns: TurnIn[];
      /** Per unit; null when nothing prices the LP. */
      cost: number | null;
      /** LP still needed beyond the pilot's balance; 0 when they have enough (or it's unknown). */
      lpShort: number;
      balanceKnown: boolean;
      /** Turn-ins still to buy that nobody sells. */
      unbuyable: TurnIn[];
      /** Can't be redeemed now: too little LP, or a turn-in that can't be bought. */
      blocked: boolean;
    };

/** LP and turn-ins already spent by earlier picks of the same fix. */
export interface Spent {
  lp: Map<number, number>;
  items: Map<number, number>;
}

const nothingSpent = (): Spent => ({ lp: new Map(), items: new Map() });

function lpSource(offer: LpOfferInput, context: SourceContext, spent: Spent): Source {
  const balance = context.lpBalance(offer.corporationId);
  const lpLeft = balance === null ? null : balance - (spent.lp.get(offer.corporationId) ?? 0);
  const turnIns = offer.requiredItems.map((item) => {
    const owned = Math.max(0, context.owned(item.typeId) - (spent.items.get(item.typeId) ?? 0));
    const toBuy = Math.max(0, item.quantity - owned);
    return {
      typeId: item.typeId,
      quantity: item.quantity,
      owned: Math.min(owned, item.quantity),
      toBuy,
      unitPrice: toBuy > 0 ? context.turnInPrice(item.typeId) : null,
    };
  });
  const unbuyable = turnIns.filter((t) => t.toBuy > 0 && t.unitPrice === null);
  const lpShort = lpLeft === null ? 0 : Math.max(0, offer.lpCost - lpLeft);
  const rate = context.lpRate(offer.corporationId);
  const turnInCost = turnIns.reduce((sum, t) => sum + t.toBuy * (t.unitPrice ?? 0), 0);
  const priced = rate !== null || offer.lpCost === 0;
  return {
    kind: 'lp',
    corporationId: offer.corporationId,
    corpName: offer.corpName,
    iskCost: offer.iskCost,
    lpCost: offer.lpCost,
    quantity: offer.quantity,
    lpRate: rate,
    turnIns,
    cost: priced
      ? (offer.iskCost + offer.lpCost * (rate ?? 0) + turnInCost) / Math.max(1, offer.quantity)
      : null,
    lpShort,
    balanceKnown: lpLeft !== null,
    unbuyable,
    blocked: lpShort > 0 || unbuyable.length > 0,
  };
}

/** 0: usable and priced; 1: usable but its LP is unpriced; 2: can't be redeemed now. */
function tier(source: Source): number {
  if (source.kind === 'market') return 0;
  if (source.blocked) return 2;
  return source.cost === null ? 1 : 0;
}

/** Every way to get `typeId`, best first. */
export function rankSources(
  typeId: number,
  offers: readonly LpOfferInput[],
  context: SourceContext,
  spent: Spent = nothingSpent()
): Source[] {
  const sources: Source[] = offers.map((offer) => lpSource(offer, context, spent));
  const market = pickSource(context.hubPrices(typeId), context.selectedHubId);
  if (market) sources.push({ kind: 'market', ...market, cost: market.price });
  return sources.sort((a, b) => tier(a) - tier(b) || (a.cost ?? Infinity) - (b.cost ?? Infinity));
}

/** The best source the pilot can actually buy from now, priced. */
export function usableSource(sources: readonly Source[]): Source | null {
  return sources.find((s) => tier(s) === 0) ?? null;
}

export interface PricedFix {
  cost: number;
  /** Index-parallel to the fix's typeIds. */
  sources: Source[];
}

/**
 * What a fix of several implants costs when bought together: each at its best
 * usable source, with one store's LP and the pilot's owned turn-ins spent
 * once across the lot. Null when one of them can't be had.
 */
export function priceFix(
  typeIds: readonly number[],
  offersFor: (typeId: number) => readonly LpOfferInput[],
  context: SourceContext
): PricedFix | null {
  const spent = nothingSpent();
  const sources: Source[] = [];
  let cost = 0;
  for (const typeId of typeIds) {
    const best = usableSource(rankSources(typeId, offersFor(typeId), context, spent));
    if (!best || best.cost === null) return null;
    sources.push(best);
    cost += best.cost;
    if (best.kind === 'lp') {
      spent.lp.set(best.corporationId, (spent.lp.get(best.corporationId) ?? 0) + best.lpCost);
      for (const t of best.turnIns) {
        spent.items.set(t.typeId, (spent.items.get(t.typeId) ?? 0) + t.owned);
      }
    }
  }
  return { cost, sources };
}

/**
 * What to show beside the source a row leads with: the cheapest offer the
 * pilot can't redeem yet when it would have been cheaper ("Cheaper if you
 * could"), else simply the next way to get it. Null when there is no other.
 */
export function alternativeSource(
  sources: readonly Source[],
  shown: Source
): { source: Source; cheaperIfYouCould: boolean } | null {
  const cheaper = sources
    .filter((s) => s !== shown && s.kind === 'lp' && s.blocked && s.cost !== null)
    .filter(
      (s) => shown.cost !== null && !(shown.kind === 'lp' && shown.blocked) && s.cost! < shown.cost
    )
    .sort((a, b) => a.cost! - b.cost!)[0];
  if (cheaper) return { source: cheaper, cheaperIfYouCould: true };
  const next = sources.find((s) => s !== shown);
  return next ? { source: next, cheaperIfYouCould: false } : null;
}
