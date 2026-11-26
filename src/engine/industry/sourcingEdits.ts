import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';

export function applySourcingPatch(
  sourcing: MaterialSourcingMap | undefined,
  typeID: number,
  patch: MaterialSourcing
): MaterialSourcingMap | undefined {
  return normalizeMaterialSourcingMap({
    ...sourcing,
    [typeID]: { ...sourcing?.[typeID], ...patch },
  });
}
