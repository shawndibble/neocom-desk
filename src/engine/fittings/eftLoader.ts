/**
 * Turns a parsed EFT fit (`engine/import/eftFit.ts`) into a `Fitting`'s
 * `LoadParts` (issue #1531, `load.ts`) — the "Load EFT" half of #1532. `parseEftFit` only reads the
 * paste's text structure (names, an optional loaded charge, section blank
 * lines it deliberately doesn't track); this is where a name becomes a
 * typeId and a typeId becomes a rack.
 *
 * A resolved item's rack comes from `FittingSlotMap` (`scripts/build-fitting-
 * slots.mjs`), never from its position in the pasted text: EFT's section
 * order isn't reliable enough to infer a slot from (a fit with cargo but no
 * drones has one trailing "xN" group, which by position alone reads as
 * drones; a spare module tucked in cargo would misplace into a rack). A type
 * with no rack in that map (ammo, boosters, ships, anything the map has
 * nothing for) is cargo instead — that is what "cargo" *means* once slot
 * membership is known, not a fallback for whatever position parsing missed.
 *
 * `parseEftFit` strips a module's `/offline` suffix without exposing it, so
 * this reads it back off the source line: a module line ending in `/OFFLINE`
 * loads `'offline'`, every other module loads `'active'`. A
 * drone-bay stack loads `'online'` (carried, not deployed): an EFT paste
 * describes what a fit *carries*, not which drones happen to be in space
 * right now. The workspace then launches what the pilot can field once the
 * stats are in (scope decision `20260925-113331`).
 */
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

/** A `TypeCatalog` value, matching `features/skills/typeCatalog.ts`'s shape. */
export interface EftTypeLookup {
  get(nameLowercased: string): { typeID: number } | undefined;
}

export type EftSlotLookup = Readonly<Record<string, FittingSlotAssignment>>;

/**
 * Same shape as `eftFit.ts`'s own `QUANTITY_SUFFIX` — duplicated rather than
 * imported, since that parser folds a missing suffix and an explicit `x1`
 * into the same `quantity: 1` and exposes neither the raw line nor which one
 * it was. Whether a count was actually *written* is exactly the signal that
 * tells a fitted module (never gets one) apart from a single spare sitting
 * in cargo (EVE's own export always writes one, even for `x1`).
 */
const HAS_QUANTITY_SUFFIX = /^.*\S\s+x\d+$/i;
const OFFLINE_SUFFIX = /\s*\/offline\s*$/i;

export function resolveTypeId(name: string, typeByName: EftTypeLookup): number | null {
  return typeByName.get(name.toLowerCase())?.typeID ?? null;
}

/**
 * `mutaplasmids` resolves Pyfa's `[N]` refs (`eftFit.ts`) to the abyssal type,
 * rolls cut to the mutaplasmid's. Unknown or inapplicable mutaplasmid: plain
 * base plus an `'unknown-mutation'` warning. No block or no `mutaplasmids`:
 * plain base, as Pyfa does. A bare abyssal line: that type, base unknown.
 */
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

  /** The abyssal type and mutation a referenced line loads as; null to load the base plain. */
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
    if (item.isCharge) continue; // consumed by the module ahead of it, below

    const nextIsCharge = items[i + 1]?.isCharge === true && items[i + 1].line === item.line;
    const chargeTypeId = nextIsCharge ? resolveCharge(items[i + 1]) : undefined;
    if (nextIsCharge) i++; // its charge, already handled either way

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
      // One drone per mutated item, capped at what a share code holds (a pasted count is unbounded).
      for (let n = 0; n < Math.min(item.quantity, MAX_DRONE_STACKS); n++) {
        drones.push({ typeId, quantity: 1, state: 'online', ...mutation });
      }
    } else if (rack === 'drone') {
      drones.push({ typeId, quantity: item.quantity, state: 'online' });
    } else if (isFighter(typeId)) {
      // A fighter line is a squadron (or a stack of them), always to the bay.
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

  // Deterministic order regardless of the order sections happened to appear
  // in the pasted text — the same order the List view's racks render in.
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
