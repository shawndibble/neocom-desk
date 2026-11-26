import { piTier } from '@/engine/pi/chain';
import { loadPi } from '@/sde/loadSde';
import type { PiData } from '@/sde/types';

export interface ProductOption {
  typeId: number;
  name: string;
  tier: 1 | 2 | 3 | 4;
}

export function productOptions(pi: PiData): ProductOption[] {
  const options: ProductOption[] = [];
  for (const [key, schematic] of Object.entries(pi.schematics)) {
    const typeId = Number(key);
    let tier: number;
    try {
      tier = piTier(typeId, pi);
    } catch {
      continue;
    }
    if (tier < 1 || tier > 4) continue;
    options.push({ typeId, name: schematic.name, tier: tier as 1 | 2 | 3 | 4 });
  }
  return options.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

export function plannableTypeIds(pi: PiData): Set<number> {
  return new Set(productOptions(pi).map((option) => option.typeId));
}

let resolvedIds: ReadonlySet<number> | null = null;
let inFlight: Promise<ReadonlySet<number>> | null = null;

export function loadPlannableTypeIds(): Promise<ReadonlySet<number>> {
  inFlight ??= loadPi()
    .then((pi) => {
      resolvedIds = plannableTypeIds(pi);
      return resolvedIds;
    })
    .catch((err: unknown) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export function peekPlannableTypeIds(): ReadonlySet<number> | null {
  return resolvedIds;
}

export { productBySchematicId } from './productMap';
