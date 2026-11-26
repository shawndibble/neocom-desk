import {
  MUTATION_REF_SUFFIX,
  parseEftFit,
  type EftItem,
  type EftMutationBlock,
} from '@/engine/import/eftFit';
import { MAX_DRONE_STACKS, MAX_SLOTS_PER_CATEGORY } from '@/engine/fittings/fittingShare';
import type { FittingSlotAssignment } from '@/sde/types';
import type { LoadParts, LoadWarning } from './load';
import {
  sortFittingModules,
  type FittingCargoItem,
  type FittingDrone,
  type FittingFighter,
  type FittingModule,
  type FittingSlotKind,
} from './types';
import { isFighter, squadronsOf } from './fighters';
import { normaliseMutation, type MutaplasmidLookup } from './mutaplasmids';
import type { ItemMutation } from './types';

export interface EftTypeLookup {
  get(nameLowercased: string): { typeID: number } | undefined;
}

export type EftSlotLookup = Readonly<Record<string, FittingSlotAssignment>>;

const HAS_QUANTITY_SUFFIX = /^.*\S\s+x\d+$/i;
const OFFLINE_SUFFIX = /\s*\/offline\s*$/i;

export function resolveTypeId(name: string, typeByName: EftTypeLookup): number | null {
  return typeByName.get(name.toLowerCase())?.typeID ?? null;
}

export function loadEftFitting(
  text: string,
  typeByName: EftTypeLookup,
  slotByTypeId: EftSlotLookup,
  mutaplasmids?: MutaplasmidLookup
): LoadParts {
  const fit = parseEftFit(text);
  const blocks = new Map<number, EftMutationBlock>();
  for (const block of fit.mutations) if (!blocks.has(block.ref)) blocks.set(block.ref, block);
  const lines = text.split(/\r\n|\r|\n/);
  const unresolved: LoadWarning[] = fit.errors.map((e) => ({
    line: e.line,
    text: e.text,
    reason: e.reason,
    kind: 'parse-error',
  }));

  const hullTypeId = resolveTypeId(fit.shipName, typeByName);
  if (hullTypeId === null) {
    unresolved.push({
      line: fit.headerLine,
      text: fit.shipName,
      reason: 'unknown ship',
      kind: 'unknown-ship',
    });
    return { hullTypeId: null, unresolved };
  }

  const modules: FittingModule[] = [];
  const drones: FittingDrone[] = [];
  const cargo: FittingCargoItem[] = [];
  const fighters: FittingFighter[] = [];
  const slotIndexByRack: Record<FittingSlotKind, number> = {
    high: 0,
    medium: 0,
    low: 0,
    rig: 0,
    subsystem: 0,
  };

  function resolveCharge(item: EftItem | undefined): number | undefined {
    if (item === undefined || !item.isCharge) return undefined;
    const chargeTypeId = resolveTypeId(item.name, typeByName);
    if (chargeTypeId === null) {
      unresolved.push({
        line: item.line,
        text: item.name,
        reason: 'unknown item',
        kind: 'unknown-item',
      });
      return undefined;
    }
    return chargeTypeId;
  }

  function resolveMutation(
    item: EftItem,
    baseTypeId: number
  ): { typeId: number; mutation: ItemMutation } | null {
    if (item.mutationRef === undefined || !mutaplasmids) return null;
    const block = blocks.get(item.mutationRef);
    if (!block) return null;
    const mutaplasmidTypeId =
      block.mutaplasmidName === undefined ? null : resolveTypeId(block.mutaplasmidName, typeByName);
    const resultTypeId =
      mutaplasmidTypeId === null ? null : mutaplasmids.resultingType(baseTypeId, mutaplasmidTypeId);
    if (mutaplasmidTypeId === null || resultTypeId === null) {
      unresolved.push({
        line: block.line + (block.mutaplasmidName === undefined ? 0 : 1),
        text: block.mutaplasmidName ?? block.baseName,
        reason: 'unknown mutaplasmid',
        kind: 'unknown-mutation',
      });
      return null;
    }
    const attributes: Record<number, number> = {};
    for (const roll of block.attributes) {
      const id = mutaplasmids.attributeId(roll.name);
      if (id !== undefined) attributes[id] = roll.value;
    }
    const mutation = normaliseMutation(
      resultTypeId,
      { baseTypeId, mutaplasmidTypeId, attributes },
      mutaplasmids
    );
    return mutation ? { typeId: resultTypeId, mutation } : null;
  }

  const items = fit.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.isCharge) continue;

    const nextIsCharge = items[i + 1]?.isCharge === true && items[i + 1].line === item.line;
    const chargeTypeId = nextIsCharge ? resolveCharge(items[i + 1]) : undefined;
    if (nextIsCharge) i++;

    const withoutRef = (lines[item.line - 1] ?? '').trim().replace(MUTATION_REF_SUFFIX, '');
    const isOffline = OFFLINE_SUFFIX.test(withoutRef);
    const rawLine = withoutRef.replace(OFFLINE_SUFFIX, '');
    const hasExplicitQuantity = HAS_QUANTITY_SUFFIX.test(rawLine);

    const namedTypeId = resolveTypeId(item.name, typeByName);
    if (namedTypeId === null) {
      unresolved.push({
        line: item.line,
        text: item.name,
        reason: 'unknown item',
        kind: 'unknown-item',
        ...(hasExplicitQuantity ? { countWritten: true } : {}),
      });
      continue;
    }

    const mutated = resolveMutation(item, namedTypeId);
    const typeId = mutated?.typeId ?? namedTypeId;
    const mutation = mutated ? { mutation: mutated.mutation } : {};
    const rack = slotByTypeId[typeId] ?? (mutated ? slotByTypeId[namedTypeId] : undefined);

    if (rack === 'drone' && mutated) {
      for (let n = 0; n < Math.min(item.quantity, MAX_DRONE_STACKS); n++) {
        drones.push({ typeId, quantity: 1, state: 'online', ...mutation });
      }
    } else if (rack === 'drone') {
      drones.push({ typeId, quantity: item.quantity, state: 'online' });
    } else if (isFighter(typeId)) {
      fighters.push(...squadronsOf(typeId, item.quantity));
    } else if (rack !== undefined && !hasExplicitQuantity) {
      const slotIndex = slotIndexByRack[rack];
      if (slotIndex >= MAX_SLOTS_PER_CATEGORY) {
        unresolved.push({
          line: item.line,
          text: item.name,
          reason: `too many ${rack} slots`,
          kind: 'too-many-slots',
          rack,
        });
        continue;
      }
      slotIndexByRack[rack] = slotIndex + 1;
      modules.push({
        slot: rack,
        slotIndex,
        typeId,
        state: isOffline ? 'offline' : 'active',
        ...(chargeTypeId === undefined ? {} : { chargeTypeId }),
        ...mutation,
      });
    } else {
      cargo.push({ typeId, quantity: item.quantity });
    }
  }

  const fitName = fit.fitName.trim();
  return {
    hullTypeId,
    modules: sortFittingModules(modules),
    drones,
    cargo,
    ...(fitName === '' ? {} : { fitName }),
    ...(fighters.length > 0 ? { fighters } : {}),
    unresolved,
  };
}
