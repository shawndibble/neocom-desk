import type { WorkbenchFitCheck } from '@/engine/fittings/workbenchFitCheck';
import {
  hullCommonality,
  propulsionKindOf,
  type CommonalityFit,
  type HullCommonality,
} from '@/engine/fittings/hullCommonality';
import type { TypeMap } from '@/sde/types';
import type { WorkbenchFit } from './workbenchFits';
import {
  checkWorkbenchFits,
  workbenchHullSources,
  type WorkbenchHullSources,
} from './workbenchHullRows';

export function commonalityFitsOf(
  fits: readonly Pick<WorkbenchFit, 'id' | 'name'>[],
  checks: ReadonlyMap<string, WorkbenchFitCheck>
): CommonalityFit[] {
  return fits.flatMap((fit): CommonalityFit[] => {
    const check = checks.get(fit.id);
    if (!check?.verdict.current || check.hullTypeId === null) return [];
    return [{ name: fit.name, moduleTypeIds: check.modules.map((module) => module.typeId) }];
  });
}

export function hullCommonalityOf(
  fits: readonly Pick<WorkbenchFit, 'id' | 'name'>[],
  checks: ReadonlyMap<string, WorkbenchFitCheck>,
  types: TypeMap
): HullCommonality {
  return hullCommonality(
    commonalityFitsOf(fits, checks),
    (typeId) => types[String(typeId)]?.groupID,
    (typeId) => propulsionKindOf(types[String(typeId)]?.groupID, types[String(typeId)]?.name)
  );
}

const memo = new WeakMap<object, Promise<HullCommonality>>();

export type CommonalitySources = Pick<WorkbenchHullSources, 'workbenchFits' | 'gameData'>;

export async function loadHullCommonality(
  shipTypeId: number,
  types: TypeMap,
  sources: CommonalitySources = workbenchHullSources
): Promise<HullCommonality | null> {
  try {
    const stored = await sources.workbenchFits(shipTypeId);
    if (!stored.ok || stored.fits.length === 0) return null;
    let reduced = memo.get(stored.fits);
    if (!reduced) {
      reduced = (async () => {
        const data = await sources.gameData();
        const checks = await checkWorkbenchFits(
          stored.fits,
          data,
          () => false,
          () => Promise.resolve()
        );
        return hullCommonalityOf(stored.fits, checks ?? new Map(), types);
      })();
      memo.set(stored.fits, reduced);
      reduced.catch(() => memo.delete(stored.fits));
    }
    return await reduced;
  } catch {
    return null;
  }
}
