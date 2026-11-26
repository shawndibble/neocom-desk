import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  chargesPerLoad as chargesInCapacity,
  loadChargeIntoCompatible,
  type ModuleAt,
} from '@/engine/fittings/fittingEdit';
import type { ChargeLoadStep } from '@/engine/fittings/improve';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingModule, FittingModuleResult } from '@/engine/fittings/types';
import type { FittingContext } from './fittingContext';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';
import { useTimedToast, MESSAGE_MS } from '@/components/ui/useTimedToast';

interface ChargeLoadingParams {
  fitting: Fitting | null;
  catalogue: FittingCatalogue | null;
  moduleResults: FittingModuleResult[] | null;
  context: FittingContext | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
}

export interface LoadChargeOptions {
  fromCargo?: boolean;
  only?: ModuleAt | readonly ModuleAt[];
}

export interface ChargeLoading {
  accepts: (module: FittingModule, chargeTypeId: number) => boolean;
  targetsFor: (chargeTypeId: number) => string[];
  cargoChargesFor: (module: FittingModule) => number[];
  load: (chargeTypeId: number, options?: LoadChargeOptions) => void;
  loadSteps: (steps: readonly ChargeLoadStep[]) => Fitting | null;
  message: string | null;
}

export function useChargeLoading({
  fitting,
  catalogue,
  moduleResults,
  context,
  edit,
}: ChargeLoadingParams): ChargeLoading {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  useTimedToast(message, () => setMessage(null), MESSAGE_MS);
  const shipTypeId = fitting?.shipTypeId ?? null;

  const caches = useMemo(
    () => ({ fits: new Map<string, boolean>(), capacity: new Map<string, number>() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caches are keyed on exactly these
    [shipTypeId, context]
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
      if (shipTypeId === null || context === null) return false;
      const entry = resultByKey.get(moduleKey(module));
      if (entry === undefined || entry.typeId !== module.typeId) return false;
      const groupId = context.catalogue.types[String(chargeTypeId)]?.groupID;
      if (groupId === undefined || !entry.result.chargeGroupIds.includes(groupId)) return false;
      const key = `${module.slot}:${module.typeId}:${chargeTypeId}`;
      let fits = caches.fits.get(key);
      if (fits === undefined) {
        fits = context.engine
          .checkCharges(shipTypeId, module, [chargeTypeId], context.profile)
          .has(chargeTypeId);
        caches.fits.set(key, fits);
      }
      return fits;
    },
    [shipTypeId, context, resultByKey, caches]
  );

  const chargesPerLoad = useCallback(
    (module: FittingModule, chargeTypeId: number): number => {
      if (shipTypeId === null || context === null) return 1;
      const key = `${module.slot}:${module.typeId}`;
      let capacity = caches.capacity.get(key);
      if (capacity === undefined) {
        capacity = context.engine.moduleChargeCapacity(shipTypeId, module);
        caches.capacity.set(key, capacity);
      }
      return chargesInCapacity(capacity, catalogueVolume(context.catalogue, chargeTypeId));
    },
    [shipTypeId, context, caches]
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

  const loadSteps = useCallback(
    (steps: readonly ChargeLoadStep[]): Fitting | null => {
      let made: Fitting | null = null;
      edit((current) => {
        const next = steps.reduce(
          (acc, step) =>
            loadChargeIntoCompatible(acc, step.chargeTypeId, {
              accepts: (module) => accepts(module, step.chargeTypeId),
              chargesPerLoad,
              fromCargo: step.fromCargo,
              only: step.at,
            }).fitting,
          current
        );
        made = next === current ? null : next;
        return next;
      });
      return made;
    },
    [edit, accepts, chargesPerLoad]
  );

  return useMemo(
    () => ({ accepts, targetsFor, cargoChargesFor, load, loadSteps, message }),
    [accepts, targetsFor, cargoChargesFor, load, loadSteps, message]
  );
}
