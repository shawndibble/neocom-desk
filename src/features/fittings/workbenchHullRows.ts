import { useEffect, useMemo, useState } from 'react';
import {
  gameItemLookup,
  partitionByCurrency,
  type FitCurrency,
  type HullSlotCounts,
} from '@/engine/fittings/fitCurrency';
import type { EftSlotLookup, EftTypeLookup } from '@/engine/fittings/eftLoader';
import { fitSellPrice, type FitSellPrice, type HubSides } from '@/engine/fittings/fitSellPrice';
import type { LoadedFitting, LoadOutcome, ShareLoad } from '@/engine/fittings/load';
import type { RackModule } from '@/engine/fittings/types';
import {
  checkWorkbenchFit,
  type WorkbenchFitCheck,
  type WorkbenchGameData,
} from '@/engine/fittings/workbenchFitCheck';
import {
  matchWorkbenchSightings,
  type WorkbenchSighting,
} from '@/engine/fittings/workbenchSightings';
import { useHubFor } from '@/features/market/hub';
import { scaleHubPrices } from '@/features/market/hubPricesAtPercent';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadFittingSlots, loadGameTypeNames, loadShipTree } from '@/sde/loadSde';
import { loadFittingFromText } from './loadFittingFromText';
import { loadPopularFits, type PopularFitsResult } from './popularFits';
import { yieldToEventLoop } from './yieldToEventLoop';
import { loadWorkbenchFits, type WorkbenchFit, type WorkbenchFitsResult } from './workbenchFits';

export interface WorkbenchHullSources {
  workbenchFits: (shipTypeId: number) => Promise<WorkbenchFitsResult>;
  gameData: () => Promise<WorkbenchGameData>;
  hubPrices: (hub: TradeHub, typeIds: readonly number[]) => Promise<ReadonlyMap<number, HubSides>>;
  popularFits: (shipTypeId: number) => Promise<PopularFitsResult>;
  loadText: (eft: string) => Promise<LoadOutcome | ShareLoad>;
}

export interface WorkbenchSde {
  itemNames: () => Promise<EftTypeLookup>;
  fittingSlots: () => Promise<EftSlotLookup>;
  shipTree: () => Promise<{
    ships: readonly {
      typeID: number;
      stats: { highSlots: number; medSlots: number; lowSlots: number; rigSlots: number };
    }[];
  }>;
  gameTypeNames: () => Promise<readonly string[]>;
}

const everyNameIsTheGames = (): boolean => true;

export function workbenchGameDataLoader(sde: WorkbenchSde): () => Promise<WorkbenchGameData> {
  let pending: Promise<WorkbenchGameData> | null = null;
  const isGameItem = (): Promise<(name: string) => boolean> =>
    Promise.resolve()
      .then(sde.gameTypeNames)
      .then(gameItemLookup, () => {
        pending = null;
        return everyNameIsTheGames;
      });
  return () => {
    pending ??= Promise.resolve()
      .then(() => Promise.all([sde.itemNames(), sde.fittingSlots(), sde.shipTree(), isGameItem()]))
      .then(([typeByName, slotByTypeId, shipTree, gameItems]): WorkbenchGameData => {
        const slotsByHull = new Map<number, HullSlotCounts>(
          shipTree.ships.map(({ typeID, stats }) => [
            typeID,
            {
              high: stats.highSlots,
              medium: stats.medSlots,
              low: stats.lowSlots,
              rig: stats.rigSlots,
            },
          ])
        );
        return {
          typeByName,
          slotByTypeId,
          hullSlots: (shipTypeId) => slotsByHull.get(shipTypeId) ?? null,
          isGameItem: gameItems,
        };
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
    return pending;
  };
}

export const workbenchHullSources: WorkbenchHullSources = {
  workbenchFits: (shipTypeId) => loadWorkbenchFits(shipTypeId),
  gameData: workbenchGameDataLoader({
    itemNames: () => loadItemNameMap(),
    fittingSlots: () => loadFittingSlots(),
    shipTree: () => loadShipTree(),
    gameTypeNames: () => loadGameTypeNames(),
  }),
  hubPrices: (hub, typeIds) => getHubPrices(hub, [...typeIds]),
  popularFits: (shipTypeId) => loadPopularFits(shipTypeId),
  loadText: (eft) => loadFittingFromText(eft),
};

const CHUNK_SIZE = 25;

const checkCache = new Map<string, { eft: string; check: WorkbenchFitCheck }>();

export function resetWorkbenchCheckCache(): void {
  checkCache.clear();
}

function cachedCheck(fit: Pick<WorkbenchFit, 'id' | 'eft'>, data: WorkbenchGameData) {
  const hit = checkCache.get(fit.id);
  if (hit?.eft === fit.eft) return hit.check;
  const check = checkWorkbenchFit(fit.eft, data);
  checkCache.set(fit.id, { eft: fit.eft, check });
  return check;
}

export async function checkWorkbenchFits(
  fits: readonly Pick<WorkbenchFit, 'id' | 'eft'>[],
  data: WorkbenchGameData,
  cancelled: () => boolean = () => false,
  yieldToUi: () => Promise<void> = yieldToEventLoop
): Promise<Map<string, WorkbenchFitCheck> | null> {
  const checks = new Map<string, WorkbenchFitCheck>();
  for (let start = 0; start < fits.length; start += CHUNK_SIZE) {
    if (start > 0) await yieldToUi();
    if (cancelled()) return null;
    for (const fit of fits.slice(start, start + CHUNK_SIZE)) {
      checks.set(fit.id, cachedCheck(fit, data));
    }
  }
  return checks;
}

const NO_CHECKS: ReadonlyMap<string, WorkbenchFitCheck> = new Map();
const NO_PRICES: ReadonlyMap<number, HubSides> = new Map();
const NO_SIGHTINGS: ReadonlyMap<string, WorkbenchSighting> = new Map();

type Ask<K, T> = (sources: WorkbenchHullSources, key: K, cancelled: () => boolean) => Promise<T>;

function useAnswer<K, T>(sources: WorkbenchHullSources, key: K | null, ask: Ask<K, T>): T | null {
  const [answer, setAnswer] = useState<{ key: K; value: T } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    void ask(sources, key, () => cancelled).then((value) => {
      if (!cancelled) setAnswer({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [sources, key, ask]);
  return answer !== null && answer.key === key ? answer.value : null;
}

const askFits: Ask<number, WorkbenchFitsResult> = (sources, shipTypeId) =>
  sources.workbenchFits(shipTypeId);

const askChecks: Ask<readonly WorkbenchFit[], ReadonlyMap<string, WorkbenchFitCheck>> = (
  sources,
  fits,
  cancelled
) =>
  sources
    .gameData()
    .then((data) => checkWorkbenchFits(fits, data, cancelled))
    .catch(() => NO_CHECKS)
    .then((checks) => checks ?? NO_CHECKS);

const askPopular: Ask<number, PopularFitsResult> = (sources, shipTypeId) =>
  sources
    .popularFits(shipTypeId)
    .catch((): PopularFitsResult => ({ ok: false, reason: 'offline' }));

const askPrices: Ask<
  { hub: TradeHub; typeIds: readonly number[] },
  ReadonlyMap<number, HubSides>
> = (sources, { hub, typeIds }) => sources.hubPrices(hub, typeIds).catch(() => NO_PRICES);

export interface WorkbenchRow {
  fit: WorkbenchFit;
  modules: readonly RackModule[];
  requirementTypeIds: readonly number[];
  price: FitSellPrice | undefined;
  sighting: WorkbenchSighting | undefined;
  loadFailed: boolean;
}

export interface WorkbenchHullRows {
  status: 'loading' | 'failed' | 'empty' | 'ready';
  checking: boolean;
  rows: WorkbenchRow[];
  moduleTypeIds: readonly number[] | null;
  outOfDateCount: number;
  allOutOfDate: boolean;
  hub: TradeHub;
  loading: boolean;
  load: (fit: WorkbenchFit, onOpen: (loaded: LoadedFitting) => void) => Promise<void>;
}

export function useWorkbenchHullRows(
  shipTypeId: number,
  sources: WorkbenchHullSources = workbenchHullSources
): WorkbenchHullRows {
  const stored = useAnswer(sources, shipTypeId, askFits);
  const fits = stored?.ok ? stored.fits : null;
  const checks = useAnswer(sources, fits, askChecks);
  const popular = useAnswer(sources, fits?.length ? shipTypeId : null, askPopular);
  const sightings = useMemo(
    () =>
      checks !== null && popular?.ok
        ? matchWorkbenchSightings(checks, popular.fits, shipTypeId)
        : NO_SIGHTINGS,
    [checks, popular, shipTypeId]
  );

  const { hubId } = useHubFor('fittings');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const percent = usePricePercentFor('fittings');
  const { current, outOfDate } = useMemo(
    () =>
      partitionByCurrency(
        fits ?? [],
        new Map(
          [...(checks ?? [])].map(([id, check]): [string, FitCurrency] => [id, check.verdict])
        )
      ),
    [fits, checks]
  );
  const listedChecks = useMemo(
    () =>
      checks === null
        ? null
        : current.flatMap((fit) => {
            const check = checks.get(fit.id);
            return check === undefined ? [] : [[fit.id, check] as const];
          }),
    [checks, current]
  );
  const priceKey = useMemo(() => {
    if (listedChecks === null) return null;
    const ids = new Set<number>();
    for (const [, check] of listedChecks) for (const [typeId] of check.items) ids.add(typeId);
    return ids.size === 0 ? null : { hub, typeIds: [...ids].sort((a, b) => a - b) };
  }, [listedChecks, hub]);
  const prices = useAnswer(sources, priceKey, askPrices);
  const priceById = useMemo(() => {
    const priced = new Map<string, FitSellPrice>();
    if (listedChecks === null || prices === null) return priced;
    const atPercent = scaleHubPrices(prices, percent);
    for (const [id, check] of listedChecks) {
      const price = fitSellPrice(check.items, atPercent);
      if (price !== null) priced.set(id, price);
    }
    return priced;
  }, [listedChecks, prices, percent]);

  const moduleTypeIds = useMemo(() => {
    if (listedChecks === null) return null;
    const ids = new Set<number>();
    for (const [, check] of listedChecks) for (const { typeId } of check.modules) ids.add(typeId);
    return [...ids];
  }, [listedChecks]);
  const checking = fits !== null && checks === null;

  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (checking) return [];
    return current.map((fit): WorkbenchRow => {
      const check = checks?.get(fit.id);
      return {
        fit,
        modules: check?.modules ?? [],
        requirementTypeIds: check?.requirementTypeIds ?? [],
        price: priceById.get(fit.id),
        sighting: sightings.get(fit.id),
        loadFailed: failedId === fit.id,
      };
    });
  }, [checking, checks, current, priceById, sightings, failedId]);

  async function load(fit: WorkbenchFit, onOpen: (loaded: LoadedFitting) => void) {
    setLoadingId(fit.id);
    setFailedId(null);
    try {
      const outcome = await sources.loadText(fit.eft);
      if (outcome.kind === 'fitting') onOpen(outcome);
      else setFailedId(fit.id);
    } catch {
      setFailedId(fit.id);
    } finally {
      setLoadingId(null);
    }
  }

  return {
    status:
      stored === null
        ? 'loading'
        : !stored.ok
          ? 'failed'
          : stored.fits.length === 0
            ? 'empty'
            : 'ready',
    checking,
    rows,
    moduleTypeIds,
    outOfDateCount: outOfDate.length,
    allOutOfDate: outOfDate.length > 0 && current.length === 0,
    hub,
    loading: loadingId !== null,
    load,
  };
}
