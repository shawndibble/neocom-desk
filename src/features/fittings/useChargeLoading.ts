/**
 * Which fitted modules take a charge, and loading it into them — the one
 * path behind every way a charge goes in: a drag from Cargo onto the Ring or
 * the List, a cargo item's "Load into all compatible", a module's
 * "Load charge ▸", the Add panel's Charges tab.
 *
 * A module takes a charge when the charge's group is one of the module's
 * own charge groups and the engine's own check (`checkCharges`: size,
 * capacity) passes — so ammo, missiles, bombs, scripts, crystals, cap
 * boosters and paste all go through here with no special cases. The engine
 * answers are memoized per hull, pilot and (rack, module type, charge).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chargesPerLoad as chargesInCapacity,
  loadChargeIntoCompatible,
  type ModuleAt,
} from '@/engine/fittings/fittingEdit';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type {
  Fitting,
  FittingModule,
  FittingModuleResult,
  PilotProfile,
} from '@/engine/fittings/types';
import { checkCharges, moduleChargeCapacity } from './dogmaFittingEngine';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

const MESSAGE_MS = 6000;

interface ChargeLoadingParams {
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  /** Index-parallel to `fitting.modules`; null while it calculates — then nothing is offered. */
  moduleResults: FittingModuleResult[] | null;
  engineReady: boolean;
  profile: PilotProfile | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
}

export interface LoadChargeOptions {
  /** Out of the Fitting's cargo: debited, and what it replaces goes back. */
  fromCargo?: boolean;
  /** Only this module (an Alt-drop, "Load into…"), or these (a weapon group). */
  only?: ModuleAt | readonly ModuleAt[];
}

export interface ChargeLoading {
  /** Whether `module` takes `chargeTypeId`. */
  accepts: (module: FittingModule, chargeTypeId: number) => boolean;
  /** The `moduleKey`s of every fitted module that takes it — a drag's lit slots. */
  targetsFor: (chargeTypeId: number) => string[];
  /** Every charge in the cargo that `module` takes. */
  cargoChargesFor: (module: FittingModule) => number[];
  load: (chargeTypeId: number, options?: LoadChargeOptions) => void;
  /** What the last load did ("Loaded … into 3 of 4 modules"), for a status line; null before one. */
  message: string | null;
}

export function useChargeLoading({
  fitting,
  catalogue,
  moduleResults,
  engineReady,
  profile,
  edit,
}: ChargeLoadingParams): ChargeLoading {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  // The status line says what the last load did, then clears.
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);
  const shipTypeId = fitting?.shipTypeId ?? null;

  // Rebuilt when the hull or pilot changes, which is also when an answer could.
  const caches = useMemo(
    () => ({ fits: new Map<string, boolean>(), capacity: new Map<string, number>() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caches are keyed on exactly these
    [shipTypeId, profile, engineReady]
  );

  const resultByKey = useMemo(() => {
    const map = new Map<string, { typeId: number; result: FittingModuleResult }>();
    if (fitting === null || moduleResults === null) return map;
    fitting.modules.forEach((module, index) => {
      const result = moduleResults[index];
      if (result) map.set(moduleKey(module), { typeId: module.typeId, result });
    });
    return map;
  }, [fitting, moduleResults]);

  const accepts = useCallback(
    (module: FittingModule, chargeTypeId: number): boolean => {
      if (shipTypeId === null || catalogue === null || !engineReady || profile === null) {
        return false;
      }
      const entry = resultByKey.get(moduleKey(module));
      // A module the calculation hasn't reached (or a swap it's still behind on) takes nothing yet.
      if (entry === undefined || entry.typeId !== module.typeId) return false;
      const groupId = catalogue.types[String(chargeTypeId)]?.groupID;
      if (groupId === undefined || !entry.result.chargeGroupIds.includes(groupId)) return false;
      const key = `${module.slot}:${module.typeId}:${chargeTypeId}`;
      let fits = caches.fits.get(key);
      if (fits === undefined) {
        fits = checkCharges(shipTypeId, module, [chargeTypeId], profile).has(chargeTypeId);
        caches.fits.set(key, fits);
      }
      return fits;
    },
    [shipTypeId, catalogue, engineReady, profile, resultByKey, caches]
  );

  const chargesPerLoad = useCallback(
    (module: FittingModule, chargeTypeId: number): number => {
      if (shipTypeId === null || !engineReady) return 1;
      const key = `${module.slot}:${module.typeId}`;
      let capacity = caches.capacity.get(key);
      if (capacity === undefined) {
        capacity = moduleChargeCapacity(shipTypeId, module);
        caches.capacity.set(key, capacity);
      }
      return chargesInCapacity(capacity, catalogueVolume(catalogue, chargeTypeId));
    },
    [shipTypeId, engineReady, catalogue, caches]
  );

  const targetsFor = useCallback(
    (chargeTypeId: number) =>
      (fitting?.modules ?? [])
        .filter((module) => accepts(module, chargeTypeId))
        .map((module) => moduleKey(module)),
    [fitting, accepts]
  );

  const cargoChargesFor = useCallback(
    (module: FittingModule) => [
      ...new Set(
        (fitting?.cargo ?? [])
          .map((item) => item.typeId)
          .filter((typeId) => accepts(module, typeId))
      ),
    ],
    [fitting, accepts]
  );

  const load = useCallback(
    (chargeTypeId: number, { fromCargo = false, only }: LoadChargeOptions = {}) => {
      // Assigned, not accumulated: `edit` runs the change once, synchronously.
      let outcome: ReturnType<typeof loadChargeIntoCompatible> | null = null;
      edit((current) => {
        outcome = loadChargeIntoCompatible(current, chargeTypeId, {
          accepts: (module) => accepts(module, chargeTypeId),
          chargesPerLoad,
          fromCargo,
          only,
        });
        return outcome.fitting;
      });
      const result = outcome as ReturnType<typeof loadChargeIntoCompatible> | null;
      if (result === null) return;
      const name = catalogueTypeName(catalogue, chargeTypeId);
      // What this load did, apart from the modules that already held the charge.
      const held = result.loaded - result.newlyLoaded;
      const heldNote = held > 0 ? t('fittings.item.alreadyHeld', { count: held }) : null;
      const said =
        result.wanted === 0
          ? t('fittings.item.loadNone', { name })
          : result.ranOut
            ? t('fittings.item.loadRanOut', {
                name,
                loaded: result.newlyLoaded,
                count: result.wanted - held,
              })
            : result.newlyLoaded === 0
              ? t('fittings.item.loadAllHeld', { name })
              : t('fittings.item.loaded', { name, count: result.newlyLoaded });
      setMessage(
        result.wanted > 0 && (result.ranOut || result.newlyLoaded > 0) && heldNote
          ? `${said} ${heldNote}`
          : said
      );
    },
    [edit, accepts, chargesPerLoad, catalogue, t]
  );

  // One object while none of its parts changes, so the item menus it feeds keep their memoization.
  return useMemo(
    () => ({ accepts, targetsFor, cargoChargesFor, load, message }),
    [accepts, targetsFor, cargoChargesFor, load, message]
  );
}
