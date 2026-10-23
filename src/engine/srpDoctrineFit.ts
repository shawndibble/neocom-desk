/**
 * Doctrine Fit sources (#4857): an EFT paste or a saved Fitting becomes the corp's
 * snapshot. Client only (reuses the Fittings loaders); the match itself is srpDoctrine.ts.
 */
import {
  loadEftFitting,
  type EftSlotLookup,
  type EftTypeLookup,
} from '@/engine/fittings/eftLoader';
import type { LoadWarning } from '@/engine/fittings/load';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import type { Fitting } from '@/engine/fittings/types';
import { sortedIds, type BasesOf, type DoctrineFitSnapshot } from './srpDoctrine';

/** A mutated module is stored as its base: the doctrine names what the pilot fits, not its rolls. */
export function doctrineFitFromFitting(fitting: Fitting): DoctrineFitSnapshot {
  const modules: number[] = [];
  const rigs: number[] = [];
  for (const m of fitting.modules) {
    (m.slot === 'rig' ? rigs : modules).push(m.mutation?.baseTypeId ?? m.typeId);
  }
  return {
    hullTypeId: fitting.shipTypeId,
    name: fitting.name,
    modules: sortedIds(modules),
    rigs: sortedIds(rigs),
  };
}

export type DoctrineEftResult =
  | { ok: true; fit: DoctrineFitSnapshot; unresolved: LoadWarning[] }
  | { ok: false; unresolved: LoadWarning[] };

/** Parses EFT text via the Fittings loader. Unresolved lines are returned so the UI can warn. */
export function doctrineFitFromEft(
  text: string,
  typeByName: EftTypeLookup,
  slotByTypeId: EftSlotLookup,
  mutaplasmids?: MutaplasmidLookup
): DoctrineEftResult {
  const parts = loadEftFitting(text, typeByName, slotByTypeId, mutaplasmids);
  if (parts.hullTypeId === null) return { ok: false, unresolved: parts.unresolved };
  const fit = doctrineFitFromFitting({
    name: parts.fitName ?? '',
    shipTypeId: parts.hullTypeId,
    modules: parts.modules,
    drones: [],
    cargo: [],
  });
  return { ok: true, fit, unresolved: parts.unresolved };
}

/** `BasesOf` from the loaded mutaplasmid lookup. */
export function basesOfFromLookup(lookup: MutaplasmidLookup): BasesOf {
  return (typeId) => {
    if (!lookup.isAbyssalType(typeId)) return undefined;
    return lookup.mutaplasmidsForResult(typeId).flatMap((m) => m.baseTypeIds);
  };
}
