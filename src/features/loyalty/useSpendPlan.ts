import { useCallback, useState } from 'react';
import {
  detectOwnedStock,
  type OwnedStockPlacement,
  type OwnedStockSource,
} from '@/engine/industry/ownedStock';
import type { SkillLevels } from '@/engine/industry/types';
import { lpRate } from '@/engine/loyalty/marketLpValue';
import { planLpSpend, type SpendCandidate, type SpendPlanResult } from '@/engine/loyalty/spendPlan';
import type { ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { liveHubOrders, reachableBuyOrders } from '@/engine/market/liveBook';
import type { ResolvedStandings } from '@/engine/market/standings';
import { loadWalletBalance } from '@/features/character/wallet';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import {
  resolveStockLocationNames,
  type OwnedStockSnapshot,
} from '@/features/industry/ownedStockDetection';
import { loadHubJumps } from '@/features/market/hubJumps';
import { loadLiveBooks, type LiveBook } from '@/features/market/liveBooks';
import type { TradeHub } from '@/market/hubs';
import { useKeyedLoad, type AsyncLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useLpValue } from './lpValue';
import { loadMarketLpValue } from './marketLpValue';
import type { LoyaltyOfferRow } from './offerRows';
import { buildCostOf, outputUnitsOf, resolveLoyaltyRowItem } from './offerRowDisplay';

export const SPEND_PLAN_CANDIDATES = 10;

export interface SpendPlanView {
  result: SpendPlanResult;
  rowsById: ReadonlyMap<number, LoyaltyOfferRow>;
  walletBalance: number | null;
  candidates: number;
  ownedPlacements: ReadonlyMap<number, readonly OwnedStockPlacement[]>;
  locationNames: ReadonlyMap<number, string>;
}

export function activeCharacterTurnIns(
  sources: readonly OwnedStockSource[],
  activeCharacterId: number | null,
  typeIds: ReadonlySet<number>
): {
  owned: Map<number, number>;
  placements: Map<number, readonly OwnedStockPlacement[]>;
} {
  const owned = new Map<number, number>();
  const placements = new Map<number, readonly OwnedStockPlacement[]>();
  if (activeCharacterId === null) return { owned, placements };
  const own = sources.filter(
    (s) => s.characterId === activeCharacterId && s.corporationId === undefined
  );
  for (const [typeId, entry] of detectOwnedStock(own, typeIds)) {
    owned.set(typeId, entry.quantity);
    placements.set(typeId, entry.placements);
  }
  return { owned, placements };
}

function rankable(row: LoyaltyOfferRow, instantIskPerLp: ReadonlyMap<number, number | null>) {
  return row.offer.lp_cost > 0 && (instantIskPerLp.get(row.offer.offer_id) ?? null) !== null;
}

export function hasSpendCandidates(
  rows: readonly LoyaltyOfferRow[],
  instantIskPerLp: ReadonlyMap<number, number | null>
): boolean {
  return rows.some((row) => rankable(row, instantIskPerLp));
}

export function spendCandidates(
  rows: readonly LoyaltyOfferRow[],
  catalog: BlueprintCatalog | null,
  instantIskPerLp: ReadonlyMap<number, number | null>
): { candidate: SpendCandidate; row: LoyaltyOfferRow }[] {
  const rank = (row: LoyaltyOfferRow) => instantIskPerLp.get(row.offer.offer_id) ?? null;
  return rows
    .filter((row) => rankable(row, instantIskPerLp))
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
  rows: readonly LoyaltyOfferRow[];
  instantIskPerLp: ReadonlyMap<number, number | null>;
  catalog: BlueprintCatalog | null;
  hub: TradeHub;
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
  playerLp: number | null;
  ownedStock: OwnedStockSnapshot;
  activeCharacterId: number | null;
}

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
    request.ownLpValue > 0
      ? Promise.resolve(null)
      : loadMarketLpValue(request.corporationId, hub, { basis: 'buy' }).catch(() => null),
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
  const { owned, placements } = activeCharacterTurnIns(
    request.ownedStock.sources,
    request.activeCharacterId,
    requiredIds
  );
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
  const usedPlacements = result.rows.flatMap((row) =>
    row.turnIns.flatMap((line) => (line.owned > 0 ? (placements.get(line.typeId) ?? []) : []))
  );
  const locationNames =
    usedPlacements.length === 0
      ? new Map<number, string>()
      : await resolveStockLocationNames(usedPlacements).catch(() => new Map<number, string>());
  return {
    result,
    rowsById: new Map(picked.map((p) => [p.row.offer.offer_id, p.row])),
    walletBalance,
    candidates: picked.length,
    ownedPlacements: placements,
    locationNames,
  };
}

export interface SpendPlanState {
  plan: AsyncLoad<SpendPlanView>;
  open: boolean;
  run: () => void;
  close: () => void;
}

export function useSpendPlan(args: Args): SpendPlanState {
  useHydratedStore(useLpValue);
  const ownLpValue = useLpValue((s) => s.value);
  const [request, setRequest] = useState<Request | null>(null);
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
