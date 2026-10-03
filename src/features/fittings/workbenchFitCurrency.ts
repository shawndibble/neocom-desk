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
 */
import { useEffect, useMemo, useState } from 'react';
import {
  classifyFitCurrency,
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
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots, loadShipTree } from '@/sde/loadSde';
import type { WorkbenchFit } from './workbenchFits';

/** What the check reads: the loader's catalog and each hull's slots. */
export interface CurrencyGameData {
  typeByName: EftTypeLookup;
  slotByTypeId: EftSlotLookup;
  /** `null` for a hull the Ship Tree doesn't list — its racks then aren't counted. */
  hullSlots: (shipTypeId: number) => HullSlotCounts | null;
}

const CHUNK_SIZE = 25;

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Each fit's verdict, `CHUNK_SIZE` at a time; `null` if `cancelled()` turned true part way. */
export async function checkFitsCurrency(
  fits: readonly Pick<WorkbenchFit, 'id' | 'eft'>[],
  data: CurrencyGameData,
  cancelled: () => boolean = () => false,
  yieldToUi: () => Promise<void> = nextTask
): Promise<Map<string, FitCurrency> | null> {
  const verdicts = new Map<string, FitCurrency>();
  for (let start = 0; start < fits.length; start += CHUNK_SIZE) {
    if (start > 0) await yieldToUi();
    if (cancelled()) return null;
    for (const fit of fits.slice(start, start + CHUNK_SIZE)) {
      verdicts.set(fit.id, cachedVerdict(fit, data));
    }
  }
  return verdicts;
}

/** Verdicts by fit id, each held with the EFT it was made from. */
const verdictCache = new Map<string, { eft: string; verdict: FitCurrency }>();

function cachedVerdict(fit: Pick<WorkbenchFit, 'id' | 'eft'>, data: CurrencyGameData) {
  const hit = verdictCache.get(fit.id);
  if (hit?.eft === fit.eft) return hit.verdict;
  const parts = loadEftFitting(fit.eft, data.typeByName, data.slotByTypeId);
  const verdict = classifyFitCurrency(
    parts,
    parts.hullTypeId === null ? null : data.hullSlots(parts.hullTypeId)
  );
  verdictCache.set(fit.id, { eft: fit.eft, verdict });
  return verdict;
}

/** For tests: forget every verdict. */
export function resetFitCurrencyCache(): void {
  verdictCache.clear();
}

let gameDataPromise: Promise<CurrencyGameData> | null = null;

function loadGameData(): Promise<CurrencyGameData> {
  // Started inside a `then`, so even a synchronous throw lands in the `catch`.
  gameDataPromise ??= Promise.resolve()
    .then(() => Promise.all([loadItemNameMap(), loadFittingSlots(), loadShipTree()]))
    .then(([typeByName, slotByTypeId, shipTree]) => {
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
      };
    })
    .catch((error: unknown) => {
      gameDataPromise = null; // retry on the next check
      throw error;
    });
  return gameDataPromise;
}

const NO_VERDICTS: ReadonlyMap<string, FitCurrency> = new Map();

/** The fits' verdicts; `null` while checking. A failed game-data read reads as every fit current. */
export function useWorkbenchFitCurrency(
  fits: readonly WorkbenchFit[] | null
): ReadonlyMap<string, FitCurrency> | null {
  const [state, setState] = useState<{
    fits: readonly WorkbenchFit[];
    verdicts: ReadonlyMap<string, FitCurrency>;
  } | null>(null);
  useEffect(() => {
    if (fits === null) return;
    let cancelled = false;
    void loadGameData()
      .then((data) => checkFitsCurrency(fits, data, () => cancelled))
      .catch(() => NO_VERDICTS)
      .then((verdicts) => {
        if (!cancelled && verdicts !== null) setState({ fits, verdicts });
      });
    return () => {
      cancelled = true;
    };
  }, [fits]);
  return state !== null && state.fits === fits ? state.verdicts : null;
}

/** What the Workbench tab lists: current fits, then out-of-date ones only on request. */
export interface WorkbenchFitList {
  listed: WorkbenchFit[];
  /** Why a listed fit is out of date; `undefined` for a current one. */
  reasonsFor: (id: string) => OutOfDateReason[] | undefined;
  outOfDateCount: number;
  /** Every fit is out of date — the list would otherwise look empty. */
  allOutOfDate: boolean;
  showOutOfDate: boolean;
  setShowOutOfDate: (show: boolean) => void;
}

/** The Workbench tab's list for `fits`; until the check lands, every fit, unmarked. */
export function useWorkbenchFitList(fits: readonly WorkbenchFit[] | null): WorkbenchFitList {
  const verdicts = useWorkbenchFitCurrency(fits);
  const [showOutOfDate, setShowOutOfDate] = useState(false);
  const { current, outOfDate } = useMemo(
    () => partitionByCurrency(fits ?? [], verdicts ?? NO_VERDICTS),
    [fits, verdicts]
  );
  const reasonsById = useMemo(
    () => new Map(outOfDate.map(({ fit, reasons }) => [fit.id, reasons])),
    [outOfDate]
  );
  return {
    listed: showOutOfDate ? [...current, ...outOfDate.map(({ fit }) => fit)] : current,
    reasonsFor: (id) => reasonsById.get(id),
    outOfDateCount: outOfDate.length,
    allOutOfDate: outOfDate.length > 0 && current.length === 0,
    showOutOfDate,
    setShowOutOfDate,
  };
}
