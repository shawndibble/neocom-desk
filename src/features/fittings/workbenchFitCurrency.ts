/**
 * Which of a hull's EVE Workbench fits are **Out-of-date fit**s (issue #2485):
 * runs the EFT loader over each fit's stored EFT, in the browser, against the
 * app's current game data, and classifies the result
 * (`engine/fittings/fitCurrency.ts`). No server-side recheck, so a game update
 * shows here as soon as the app's own game data has it.
 *
 * A hull can have several hundred fits, so the check runs in small chunks
 * with a macrotask between them rather than in one blocking pass, and keeps
 * each verdict (keyed by the fit's id and EFT) so a tab switch back doesn't
 * redo it. If the game data can't be read, every fit counts as current —
 * hiding fits on a guess would be worse than not marking them.
 *
 * The same pass keeps the modules it loaded (issue #2493), so a row can draw
 * its racks without parsing the EFT a second time — and the whole fit's item
 * counts, so the row's price (`workbenchFitPrices.ts`) needs no parse either.
 *
 * An item the loader can't read is only a removed one if the game's full list
 * of type names (`typeNames.json`) lacks it too: the loader's catalogue
 * leaves out Abyssal filaments, LP boosters and mutated modules, which
 * Workbench fits carry all the time. If that list can't be read, no unread
 * item counts as removed — the rest of the check still runs.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  classifyFitCurrency,
  gameItemLookup,
  partitionByCurrency,
  type FitCurrency,
  type HullSlotCounts,
  type OutOfDateReason,
} from '@/engine/fittings/fitCurrency';
import {
  loadEftFitting,
  type EftSlotLookup,
  type EftTypeLookup,
} from '@/engine/fittings/eftLoader';
import { fittingItemCounts } from '@/engine/fittings/fittingExport';
import type { ItemCount } from '@/engine/fittings/fitSellPrice';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import type { RackModule } from '@/engine/fittings/types';
import { loadFittingSlots, loadShipTree, loadGameTypeNames } from '@/sde/loadSde';
import type { WorkbenchFit } from './workbenchFits';

/** What the check reads: the loader's catalog, each hull's slots and the game's type names. */
export interface CurrencyGameData {
  typeByName: EftTypeLookup;
  slotByTypeId: EftSlotLookup;
  /** `null` for a hull the Ship Tree doesn't list — its racks then aren't counted. */
  hullSlots: (shipTypeId: number) => HullSlotCounts | null;
  /** Whether a name the loader couldn't read is still a type in the game. */
  isGameItem: (name: string) => boolean;
}

/** One fit's check: its verdict, and the modules its EFT loaded (unread lines left out). */
export interface WorkbenchFitCheck {
  verdict: FitCurrency;
  modules: readonly RackModule[];
  /**
   * `[typeId, quantity]` for everything that loaded — hull, modules, charges,
   * drones, fighters, cargo — tallied as the Price section tallies a Fitting.
   * Empty when the hull didn't load.
   */
  items: readonly ItemCount[];
}

const CHUNK_SIZE = 25;

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Each fit's check, `CHUNK_SIZE` at a time; `null` if `cancelled()` turned true part way. */
export async function checkFitsCurrency(
  fits: readonly Pick<WorkbenchFit, 'id' | 'eft'>[],
  data: CurrencyGameData,
  cancelled: () => boolean = () => false,
  yieldToUi: () => Promise<void> = nextTask
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

/** Checks by fit id, each held with the EFT it was made from. */
const checkCache = new Map<string, { eft: string; check: WorkbenchFitCheck }>();

function cachedCheck(
  fit: Pick<WorkbenchFit, 'id' | 'eft'>,
  data: CurrencyGameData
): WorkbenchFitCheck {
  const hit = checkCache.get(fit.id);
  if (hit?.eft === fit.eft) return hit.check;
  const parts = loadEftFitting(fit.eft, data.typeByName, data.slotByTypeId);
  const check: WorkbenchFitCheck = {
    verdict: classifyFitCurrency(
      parts,
      parts.hullTypeId === null ? null : data.hullSlots(parts.hullTypeId),
      data.isGameItem
    ),
    // Rack and type only: the cache spans every hull's fits, and a row draws no more.
    modules:
      parts.hullTypeId === null ? [] : parts.modules.map(({ slot, typeId }) => ({ slot, typeId })),
    items:
      parts.hullTypeId === null
        ? []
        : [
            ...fittingItemCounts({
              name: '',
              shipTypeId: parts.hullTypeId,
              modules: parts.modules,
              drones: parts.drones,
              cargo: parts.cargo,
              fighters: parts.fighters,
            }),
          ],
  };
  checkCache.set(fit.id, { eft: fit.eft, check });
  return check;
}

/** For tests: forget every check. */
export function resetFitCurrencyCache(): void {
  checkCache.clear();
}

let gameDataPromise: Promise<CurrencyGameData> | null = null;

/** With the game's names unreadable, nothing is called removed on a guess. */
const everyNameIsTheGames = (): boolean => true;

let gameItemNamesPromise: Promise<(name: string) => boolean> | null = null;

/**
 * Never rejects: an unreadable list falls back to `everyNameIsTheGames`, and
 * the next call tries the list again. Built once and shared with the sightings
 * (#2536).
 */
export function loadGameItemNames(): Promise<(name: string) => boolean> {
  gameItemNamesPromise ??= Promise.resolve()
    .then(() => loadGameTypeNames())
    .then(gameItemLookup, () => {
      gameItemNamesPromise = null;
      return everyNameIsTheGames;
    });
  return gameItemNamesPromise;
}

function loadGameData(): Promise<CurrencyGameData> {
  // Started inside a `then`, so even a synchronous throw lands in the `catch`.
  gameDataPromise ??= Promise.resolve()
    .then(() =>
      Promise.all([loadItemNameMap(), loadFittingSlots(), loadShipTree(), loadGameItemNames()])
    )
    .then(([typeByName, slotByTypeId, shipTree, isGameItem]) => {
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
        hullSlots: (shipTypeId: number) => slotsByHull.get(shipTypeId) ?? null,
        isGameItem,
      };
    })
    .catch((error: unknown) => {
      gameDataPromise = null; // retry on the next check
      throw error;
    });
  return gameDataPromise;
}

const NO_CHECKS: ReadonlyMap<string, WorkbenchFitCheck> = new Map();
const NO_VERDICTS: ReadonlyMap<string, FitCurrency> = new Map();

/** The fits' checks; `null` while checking. A failed game-data read reads as every fit current. */
export function useWorkbenchFitCurrency(
  fits: readonly WorkbenchFit[] | null
): ReadonlyMap<string, WorkbenchFitCheck> | null {
  const [state, setState] = useState<{
    fits: readonly WorkbenchFit[];
    checks: ReadonlyMap<string, WorkbenchFitCheck>;
  } | null>(null);
  useEffect(() => {
    if (fits === null) return;
    let cancelled = false;
    void loadGameData()
      .then((data) => checkFitsCurrency(fits, data, () => cancelled))
      .catch(() => NO_CHECKS)
      .then((checks) => {
        if (!cancelled && checks !== null) setState({ fits, checks });
      });
    return () => {
      cancelled = true;
    };
  }, [fits]);
  return state !== null && state.fits === fits ? state.checks : null;
}

/** What the Workbench tab lists: current fits, then out-of-date ones only on request. */
export interface WorkbenchFitList {
  /** Still checking: nothing is listed yet, so an out-of-date fit never shows unasked. */
  checking: boolean;
  /** Every fit's check, out-of-date ones too; `null` while checking. */
  checks: ReadonlyMap<string, WorkbenchFitCheck> | null;
  listed: WorkbenchFit[];
  /** Why a listed fit is out of date; `undefined` for a current one. */
  reasonsFor: (id: string) => OutOfDateReason[] | undefined;
  /** A fit's loaded modules, from the same check; `undefined` while checking or unchecked. */
  modulesFor: (id: string) => readonly RackModule[] | undefined;
  /** Every module type across the checked fits, for looking their names up once; `null` while checking. */
  moduleTypeIds: readonly number[] | null;
  outOfDateCount: number;
  /** Every fit is out of date — the list would otherwise look empty. */
  allOutOfDate: boolean;
  showOutOfDate: boolean;
  setShowOutOfDate: (show: boolean) => void;
}

/** The Workbench tab's list for `fits`; empty until the check lands. */
export function useWorkbenchFitList(fits: readonly WorkbenchFit[] | null): WorkbenchFitList {
  const checks = useWorkbenchFitCurrency(fits);
  const verdicts = useMemo(
    () =>
      checks === null
        ? null
        : new Map([...checks].map(([id, check]): [string, FitCurrency] => [id, check.verdict])),
    [checks]
  );
  const moduleTypeIds = useMemo(
    () =>
      checks === null ? null : [...checks.values()].flatMap((c) => c.modules.map((m) => m.typeId)),
    [checks]
  );
  // Held against the fits it was asked for, so another hull starts hidden again.
  const [shownFor, setShownFor] = useState<readonly WorkbenchFit[] | null>(null);
  const showOutOfDate = fits !== null && shownFor === fits;
  const { current, outOfDate } = useMemo(
    () => partitionByCurrency(fits ?? [], verdicts ?? NO_VERDICTS),
    [fits, verdicts]
  );
  const reasonsById = useMemo(
    () => new Map(outOfDate.map(({ fit, reasons }) => [fit.id, reasons])),
    [outOfDate]
  );
  const checking = fits !== null && verdicts === null;
  return {
    checking,
    checks,
    listed: checking
      ? []
      : showOutOfDate
        ? [...current, ...outOfDate.map(({ fit }) => fit)]
        : current,
    reasonsFor: (id) => reasonsById.get(id),
    modulesFor: (id) => checks?.get(id)?.modules,
    moduleTypeIds,
    outOfDateCount: outOfDate.length,
    allOutOfDate: outOfDate.length > 0 && current.length === 0,
    showOutOfDate,
    setShowOutOfDate: (show) => setShownFor(show ? fits : null),
  };
}
