import {
  loadEftFitting,
  type EftSlotLookup,
  type EftTypeLookup,
} from '@/engine/fittings/eftLoader';
import type { LoadWarning } from '@/engine/fittings/load';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModule,
  type FittingSlotKind,
} from '@/engine/fittings/types';
import { sortedIds, type BasesOf, type DoctrineFitSnapshot } from './srpDoctrine';

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
  | {
      ok: true;
      fit: DoctrineFitSnapshot;
      fitting: Fitting;
      unresolved: LoadWarning[];
    }
  | { ok: false; unresolved: LoadWarning[] };

export function doctrineFitFromEft(
  text: string,
  typeByName: EftTypeLookup,
  slotByTypeId: EftSlotLookup,
  mutaplasmids?: MutaplasmidLookup
): DoctrineEftResult {
  const parts = loadEftFitting(text, typeByName, slotByTypeId, mutaplasmids);
  if (parts.hullTypeId === null) return { ok: false, unresolved: parts.unresolved };
  const fitting: Fitting = {
    name: parts.fitName ?? '',
    shipTypeId: parts.hullTypeId,
    modules: parts.modules,
    drones: parts.drones,
    cargo: parts.cargo,
    ...(parts.fighters?.length ? { fighters: parts.fighters } : {}),
  };
  return { ok: true, fit: doctrineFitFromFitting(fitting), fitting, unresolved: parts.unresolved };
}

const isModuleRack = (rack: string | undefined): rack is FittingSlotKind =>
  (FITTING_SLOT_KINDS as readonly string[]).includes(rack ?? '');

export function fittingFromDoctrineSnapshot(
  snapshot: DoctrineFitSnapshot,
  name: string,
  slotByTypeId: EftSlotLookup
): Fitting {
  const next: Record<FittingSlotKind, number> = {
    high: 0,
    medium: 0,
    low: 0,
    rig: 0,
    subsystem: 0,
  };
  const modules: FittingModule[] = [];
  for (const typeId of [...snapshot.modules, ...snapshot.rigs]) {
    const rack = slotByTypeId[typeId];
    if (!isModuleRack(rack)) continue;
    modules.push({ slot: rack, slotIndex: next[rack]++, typeId, state: 'active' });
  }
  modules.sort(
    (a, b) =>
      FITTING_SLOT_KINDS.indexOf(a.slot) - FITTING_SLOT_KINDS.indexOf(b.slot) ||
      a.slotIndex - b.slotIndex
  );
  return { name, shipTypeId: snapshot.hullTypeId, modules, drones: [], cargo: [] };
}

export function basesOfFromLookup(lookup: MutaplasmidLookup): BasesOf {
  return (typeId) => {
    if (!lookup.isAbyssalType(typeId)) return undefined;
    return lookup.mutaplasmidsForResult(typeId).flatMap((m) => m.baseTypeIds);
  };
}
