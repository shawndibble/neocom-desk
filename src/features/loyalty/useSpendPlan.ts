/**
 * LP Store "Spend my LP" (issue #6199): on click, and only then, reads the live
 * books of the store's top offers, the LP Value floor and the wallet, and plans
 * the redemptions with `planLpSpend`. The second surface that walks the books
 * (decision 20261030-180139, amended by this issue's decision).
 */
import { useCallback, useState } from 'react';
import { detectOwnedStock } from '@/engine/industry/ownedStock';
import type { SkillLevels } from '@/engine/industry/types';
import { lpRate } from '@/engine/loyalty/marketLpValue';
import { planLpSpend, type SpendCandidate, type SpendPlanResult } from '@/engine/loyalty/spendPlan';
import type { ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { liveHubOrders, reachableBuyOrders } from '@/engine/market/liveBook';
import type { ResolvedStandings } from '@/engine/market/standings';
import { loadWalletBalance } from '@/features/character/wallet';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import type { OwnedStockSnapshot } from '@/features/industry/ownedStockDetection';
import { loadHubJumps } from '@/features/market/hubJumps';
import { loadLiveBooks, type LiveBook } from '@/features/market/liveBooks';
import type { TradeHub } from '@/market/hubs';
import { useKeyedLoad, type AsyncLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useLpValue } from './lpValue';
import { loadMarketLpValue } from './marketLpValue';
import type { LoyaltyOfferRow } from './offerRows';
import { buildCostOf, outputUnitsOf, resolveLoyaltyRowItem } from './offerRowDisplay';

/** Offers the plan considers: the best ~10 by one-redemption Sell now ISK/LP that pass the filters. */
export const SPEND_PLAN_CANDIDATES = 10;

export interface SpendPlanView {
  result: SpendPlanResult;
  /** Offer id -> the row it plans, for names and links. */
  rowsById: ReadonlyMap<number, LoyaltyOfferRow>;
  /** Null when the wallet could not be read: the plan has no ISK cap. */
  walletBalance: number | null;
  /** Offers handed to the plan; 0 when nothing in the view had a Sell now price. */
  candidates: number;
}

/**
 * The top offers by one-redemption ISK/LP on the Sell now basis — the basis the
 * plan prices on, whatever the table's — as the engine's candidates. Offers
 * with no Sell now price are left out.
 */
export function spendCandidates(
  rows: readonly LoyaltyOfferRow[],
  catalog: BlueprintCatalog | null,
  instantIskPerLp: ReadonlyMap<number, number | null>
): { candidate: SpendCandidate; row: LoyaltyOfferRow }[] {
  const rank = (row: LoyaltyOfferRow) => instantIskPerLp.get(row.offer.offer_id) ?? null;
  return rows
    .filter((row) => rank(row) !== null && row.offer.lp_cost > 0)
    .sort((a, b) => rank(b)! - rank(a)!)
    .slice(0, SPEND_PLAN_CANDIDATES)
    .map((row) => ({
      row,
      candidate: {
        offerId: row.offer.offer_id,
        lpCost: row.offer.lp_cost,
        iskCost: row.offer.isk_cost,
        buildCost: buildCostOf(row),
        requiredItems: row.requiredItems.map(({ typeId, quantity }) => ({ typeId, quantity })),
        outputTypeId: resolveLoyaltyRowItem(row).typeId,
        outputUnits: outputUnitsOf(row, catalog),
        outputPriceCeiling: row.revenueCheck?.ceiling ?? null,
      },
    }));
}

interface Args {
  corporationId: number;
  /** The rows the table shows, filters applied. */
  rows: readonly LoyaltyOfferRow[];
  /** Each offer's Sell now ISK/LP (`useLoyaltyStoreOffers`), which ranks the candidates. */
  instantIskPerLp: ReadonlyMap<number, number | null>;
  catalog: BlueprintCatalog | null;
  hub: TradeHub;
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
  playerLp: number | null;
  ownedStock: OwnedStockSnapshot;
  activeCharacterId: number | null;
}

/** What a click captured: the plan prices what the pilot saw when they pressed. */
interface Request extends Args {
  id: number;
  ownLpValue: number;
}

async function loadSpendPlan(request: Request): Promise<SpendPlanView> {
  const picked = spendCandidates(request.rows, request.catalog, request.instantIskPerLp);
  const { hub } = request;
  const requiredIds = new Set(
    picked.flatMap((p) => p.candidate.requiredItems.map((i) => i.typeId))
  );
  const outputIds = new Set(
    picked.flatMap((p) => (p.candidate.outputTypeId === null ? [] : [p.candidate.outputTypeId]))
  );
  const books = new Map<number, LiveBook>();
  const [, jumps, market, wallet] = await Promise.all([
    loadLiveBooks(
      [...new Set([...requiredIds, ...outputIds])].map((typeId) => ({ hub, typeId })),
      (req, book) => {
        if (book !== 'failed') books.set(req.typeId, book);
      }
    ),
    loadHubJumps(hub.systemId),
    // A typed LP Value wins; the store's market rate is only read when it's blank,
    // on Sell now like every step, so the floor and the steps compare like for like.
    request.ownLpValue > 0
      ? Promise.resolve(null)
      : loadMarketLpValue(request.corporationId, hub, undefined, 'buy').catch(() => null),
    request.activeCharacterId === null
      ? Promise.resolve(null)
      : loadWalletBalance(request.activeCharacterId).catch(() => null),
  ]);

  const sellBooks = new Map<number, readonly HubOrder[]>();
  const buyBooks = new Map<number, readonly ReachableBuyOrder[]>();
  const station = { locationId: hub.stationId, systemId: hub.systemId };
  for (const [typeId, book] of books) {
    if (requiredIds.has(typeId)) {
      sellBooks.set(typeId, liveHubOrders(book.orders));
    }
    if (outputIds.has(typeId))
      buyBooks.set(typeId, reachableBuyOrders(book.orders, station, jumps));
  }
  const owned = new Map<number, number>();
  for (const [typeId, entry] of detectOwnedStock(request.ownedStock.sources, requiredIds)) {
    owned.set(typeId, entry.quantity);
  }
  const walletBalance = wallet?.data ?? null;
  const result = planLpSpend({
    candidates: picked.map((p) => p.candidate),
    lpBalance: request.playerLp ?? 0,
    walletBalance,
    lpValue: lpRate(request.ownLpValue, market),
    stationId: hub.stationId,
    sellBooks,
    buyBooks,
    owned,
    skills: request.skills,
    standing: request.standing,
  });
  return {
    result,
    rowsById: new Map(picked.map((p) => [p.row.offer.offer_id, p.row])),
    walletBalance,
    candidates: picked.length,
  };
}

export interface SpendPlanState {
  /** Idle until the button is pressed. */
  plan: AsyncLoad<SpendPlanView>;
  open: boolean;
  run: () => void;
  close: () => void;
}

export function useSpendPlan(args: Args): SpendPlanState {
  useHydratedStore(useLpValue);
  const ownLpValue = useLpValue((s) => s.value);
  const [request, setRequest] = useState<Request | null>(null);
  // A plan priced for another character, hub or store no longer answers this page: close it.
  if (
    request !== null &&
    (request.activeCharacterId !== args.activeCharacterId ||
      request.hub.id !== args.hub.id ||
      request.corporationId !== args.corporationId)
  ) {
    setRequest(null);
  }
  const loader = useCallback(
    () => (request === null ? Promise.reject(new Error('idle')) : loadSpendPlan(request)),
    [request]
  );
  const plan = useKeyedLoad(request === null ? null : String(request.id), loader);
  const run = () => setRequest((prev) => ({ ...args, ownLpValue, id: (prev?.id ?? 0) + 1 }));
  const close = () => setRequest(null);
  return { plan, open: request !== null, run, close };
}
