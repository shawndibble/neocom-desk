import type { LoadParts } from './load';
import { FITTING_SLOT_KINDS, type FittingSlotKind } from './types';

export type HullSlotCounts = Record<'high' | 'medium' | 'low' | 'rig', number>;

export type OutOfDateReason =
  | { kind: 'unknown-hull'; name: string }
  | { kind: 'removed-item'; name: string }
  | { kind: 'lost-slots'; rack: FittingSlotKind };

export type FitCurrency = { current: true } | { current: false; reasons: OutOfDateReason[] };

function subsystemSetsRacks(parts: LoadParts & { hullTypeId: number }, slots: HullSlotCounts) {
  return (
    parts.modules.some((module) => module.slot === 'subsystem') ||
    (slots.high === 0 && slots.medium === 0 && slots.low === 0)
  );
}

export function gameItemLookup(names: Iterable<string>): (name: string) => boolean {
  const known = new Set<string>();
  for (const name of names) known.add(name.toLowerCase());
  return (name) => known.has(name.toLowerCase());
}

export function classifyFitCurrency(
  parts: LoadParts,
  hullSlots: HullSlotCounts | null,
  isGameItem: (name: string) => boolean
): FitCurrency {
  const removed: OutOfDateReason[] = [];
  const removedNames = new Set<string>();
  const racks = new Set<FittingSlotKind>();

  for (const warning of parts.unresolved) {
    if (warning.kind === 'unknown-ship') {
      if (warning.text.trim() !== '') removed.push({ kind: 'unknown-hull', name: warning.text });
    } else if (warning.kind === 'unknown-item') {
      if (!removedNames.has(warning.text) && !isGameItem(warning.text)) {
        removedNames.add(warning.text);
        removed.push({ kind: 'removed-item', name: warning.text });
      }
    } else if (warning.kind === 'too-many-slots') {
      racks.add(warning.rack);
    }
  }

  if (parts.hullTypeId !== null && hullSlots !== null) {
    const skipHullRacks = subsystemSetsRacks(parts, hullSlots);
    for (const rack of ['high', 'medium', 'low', 'rig'] as const) {
      if (skipHullRacks && rack !== 'rig') continue;
      const fitted = parts.modules.filter((module) => module.slot === rack).length;
      if (fitted > hullSlots[rack]) racks.add(rack);
    }
  }

  const reasons: OutOfDateReason[] = [
    ...removed,
    ...FITTING_SLOT_KINDS.filter((rack) => racks.has(rack)).map((rack): OutOfDateReason => ({
      kind: 'lost-slots',
      rack,
    })),
  ];
  return reasons.length === 0 ? { current: true } : { current: false, reasons };
}

export function partitionByCurrency<T extends { id: string }>(
  fits: readonly T[],
  verdicts: ReadonlyMap<string, FitCurrency>
): { current: T[]; outOfDate: { fit: T; reasons: OutOfDateReason[] }[] } {
  const current: T[] = [];
  const outOfDate: { fit: T; reasons: OutOfDateReason[] }[] = [];
  for (const fit of fits) {
    const verdict = verdicts.get(fit.id);
    if (verdict === undefined || verdict.current) current.push(fit);
    else outOfDate.push({ fit, reasons: verdict.reasons });
  }
  return { current, outOfDate };
}
