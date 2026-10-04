/**
 * A hull's EVE Workbench fits as ready rows (issue #2542): the one place the
 * Workbench tab's fits are checked, priced, badged and Loaded. The panel
 * (`PopularFitsPanel.tsx`) only renders what this returns.
 *
 * Each stored EFT is parsed once (`engine/fittings/workbenchFitCheck.ts`)
 * against game data loaded once. That one check says whether the fit is an
 * **Out-of-date fit**, which modules its rack icons draw, what its price sums
 * and which key "Seen on zKillboard" matches it by — so an item the loader
 * can't read is judged by a single rule everywhere (`isGameItem`).
 *
 * Everything from outside — the stored fits (Firestore), the game data (SDE),
 * hub prices, the hull's zKillboard losses, and the text Load — comes in
 * through `WorkbenchHullSources`, as `engine/fittings/load.ts`'s `loadText`
 * takes `TextLoadSources`; `workbenchHullSources` binds the real ones.
 *
 * A hull can have several hundred fits, so the check runs in chunks with a
 * macrotask between them, and keeps each check (keyed by the fit's id and
 * EFT) so a tab switch back doesn't redo it. The cache spans every hull shown,
 * so a check holds no more than a row draws: rack and type per module, counts
 * per type. If the game data can't be read, every fit counts as current,
 * unpriced and unbadged — hiding fits on a guess would be worse than not
 * marking them; if only the game's list of type names can't be read, no
 * unread item is called removed, nor matched on.
 *
 * Prices are today's sell prices at the pilot's Default Trade Hub, the hub
 * the Fitting's Price section quotes, one lookup per hull per hub for every
 * type across its current fits (an out-of-date fit is never listed, so never
 * priced); `market/prices.ts` caches each station for its TTL. The badges
 * read the zKillboard tab's own cached load (`popularFits.ts`), so they never
 * cost a zKillboard request of their own.
 */
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
import { useMarketHub } from '@/features/market/hub';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadFittingSlots, loadGameTypeNames, loadShipTree } from '@/sde/loadSde';
import { loadFittingFromText } from './loadFittingFromText';
import { loadPopularFits, type PopularFitsResult } from './popularFits';
import { yieldToEventLoop } from './yieldToEventLoop';
import { loadWorkbenchFits, type WorkbenchFit, type WorkbenchFitsResult } from './workbenchFits';

/** What the Workbench rows read from outside. */
export interface WorkbenchHullSources {
  /** The hull's stored Workbench fits. Never throws. */
  workbenchFits: (shipTypeId: number) => Promise<WorkbenchFitsResult>;
  /** Today's game data; a throw reads as every fit current, unpriced and unbadged. */
  gameData: () => Promise<WorkbenchGameData>;
  /** Each type's sell and buy side at a hub; a throw reads as no prices. */
  hubPrices: (hub: TradeHub, typeIds: readonly number[]) => Promise<ReadonlyMap<number, HubSides>>;
  /** The hull's Popular fits from its zKillboard losses. Never throws. */
  popularFits: (shipTypeId: number) => Promise<PopularFitsResult>;
  /** A text Load of a fit's stored EFT. */
  loadText: (eft: string) => Promise<LoadOutcome | ShareLoad>;
}

/** The SDE files the game data is built from. */
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

/** With the game's names unreadable, nothing is called removed on a guess. */
const everyNameIsTheGames = (): boolean => true;

/**
 * The game data, read once and shared; a failed read is retried next time.
 * An unreadable list of type names counts every name as the game's (nothing
 * is called removed on a guess), and is read again next time.
 */
export function workbenchGameDataLoader(sde: WorkbenchSde): () => Promise<WorkbenchGameData> {
  let pending: Promise<WorkbenchGameData> | null = null;
  const isGameItem = (): Promise<(name: string) => boolean> =>
    Promise.resolve()
      .then(sde.gameTypeNames)
      .then(gameItemLookup, () => {
        pending = null; // the rest is good; read the names again next time
        return everyNameIsTheGames;
      });
  return () => {
    // Started inside a `then`, so even a synchronous throw lands in the `catch`.
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

/** The real sources: Firestore, the SDE, Fuzzwork hub prices, zKillboard and the text Load. */
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

/** Checks by fit id, each held with the EFT it was made from. */
const checkCache = new Map<string, { eft: string; check: WorkbenchFitCheck }>();

/** For tests: forget every check. */
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

/** Each fit's check, `CHUNK_SIZE` at a time; `null` if `cancelled()` turned true part way. */
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

/** One question the rows ask their sources. Never rejects. */
type Ask<K, T> = (sources: WorkbenchHullSources, key: K, cancelled: () => boolean) => Promise<T>;

/**
 * The answer `ask` gave for `key`, or `null` while it's on its way — and
 * whenever `key` has moved on: the one staleness guard, so one hull's (or
 * hub's) answer never shows against another. `null` asks nothing. Pass `key`
 * stable and `ask` a module constant.
 */
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
    // `null` only when cancelled, and a cancelled answer is dropped.
    .then((checks) => checks ?? NO_CHECKS);

const askPopular: Ask<number, PopularFitsResult> = (sources, shipTypeId) =>
  sources.popularFits(shipTypeId).catch((): PopularFitsResult => ({ ok: false }));

const askPrices: Ask<
  { hub: TradeHub; typeIds: readonly number[] },
  ReadonlyMap<number, HubSides>
> = (sources, { hub, typeIds }) => sources.hubPrices(hub, typeIds).catch(() => NO_PRICES);

/** One Workbench fit, ready to draw. */
export interface WorkbenchRow {
  fit: WorkbenchFit;
  /** The modules its EFT loaded, rack and type only. */
  modules: readonly RackModule[];
  /** Its price at `hub`; `undefined` while pricing, or when nothing in it has a sell order. */
  price: FitSellPrice | undefined;
  /** Seen on zKillboard; `undefined` when not (yet) seen. */
  sighting: WorkbenchSighting | undefined;
  /** Its last Load failed. */
  loadFailed: boolean;
}

/** A hull's Workbench tab, ready to render. */
export interface WorkbenchHullRows {
  /** The stored list: still loading, unreachable, empty, or read. */
  status: 'loading' | 'failed' | 'empty' | 'ready';
  /** Still checking: nothing is listed yet, so an out-of-date fit never flashes up. */
  checking: boolean;
  /** Current fits only: an out-of-date fit is never listed. */
  rows: WorkbenchRow[];
  /** Every module type across the checked fits, for looking their names up once; `null` while checking. */
  moduleTypeIds: readonly number[] | null;
  outOfDateCount: number;
  /** Every fit is out of date — the list would otherwise look empty. */
  allOutOfDate: boolean;
  /** The Default Trade Hub the prices are from. */
  hub: TradeHub;
  /** This hub's prices are on their way; false while there is nothing to price. */
  pricing: boolean;
  /** At least one row has a price. */
  anyPriced: boolean;
  /** A Load is under way. */
  loading: boolean;
  /** Loads a row's fit from its stored EFT and hands it to `onOpen`; a failure marks the row. */
  load: (fit: WorkbenchFit, onOpen: (loaded: LoadedFitting) => void) => Promise<void>;
}

/** The hull's Workbench fits as rows. Pass `sources` stable (a module constant). */
export function useWorkbenchHullRows(
  shipTypeId: number,
  sources: WorkbenchHullSources = workbenchHullSources
): WorkbenchHullRows {
  const stored = useAnswer(sources, shipTypeId, askFits);
  const fits = stored?.ok ? stored.fits : null;
  const checks = useAnswer(sources, fits, askChecks);
  // Asked beside the check, not after it; a hull with no fits asks zKillboard nothing.
  const popular = useAnswer(sources, fits?.length ? shipTypeId : null, askPopular);
  const sightings = useMemo(
    () =>
      checks !== null && popular?.ok
        ? matchWorkbenchSightings(checks, popular.fits, shipTypeId)
        : NO_SIGHTINGS,
    [checks, popular, shipTypeId]
  );

  const hubId = useMarketHub((state) => state.value);
  const hydrate = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
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
  // Only the listed fits' checks: an out-of-date fit is never priced or named.
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
    for (const [id, check] of listedChecks) {
      const price = fitSellPrice(check.items, prices);
      if (price !== null) priced.set(id, price);
    }
    return priced;
  }, [listedChecks, prices]);

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
    return current.map((fit): WorkbenchRow => ({
      fit,
      modules: checks?.get(fit.id)?.modules ?? [],
      price: priceById.get(fit.id),
      sighting: sightings.get(fit.id),
      loadFailed: failedId === fit.id,
    }));
  }, [checking, checks, current, priceById, sightings, failedId]);

  async function load(fit: WorkbenchFit, onOpen: (loaded: LoadedFitting) => void) {
    setLoadingId(fit.id);
    setFailedId(null);
    try {
      // The fit's own EFT header names it.
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
    pricing: priceKey !== null && prices === null,
    anyPriced: priceById.size > 0,
    loading: loadingId !== null,
    load,
  };
}
