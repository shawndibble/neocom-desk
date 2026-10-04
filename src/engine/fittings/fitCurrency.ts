/**
 * Whether a stored fit still works in today's game (issue #2485): an
 * **Out-of-date fit** (CONTEXT.md) names an item or hull the app's current
 * game data no longer has, or puts more modules in a rack than the hull now
 * has slots. Read off the EFT loader's own result (`eftLoader.ts`), so a game
 * update is picked up as soon as the app's game data is.
 *
 * Deliberately not a check: CPU, powergrid and calibration (skills and
 * implants change those, so an over-budget fit may still fly), and badly
 * written text (an unparseable line or a missing header is the author's
 * typo, not a game change — Load still reports it). Missing data never makes
 * a fit out of date: with no slot counts for the hull, racks aren't counted.
 */
import type { LoadParts } from './load';
import { FITTING_SLOT_KINDS, type FittingSlotKind } from './types';

/** A hull's slots in the racks that come from the hull itself. */
export type HullSlotCounts = Record<'high' | 'medium' | 'low' | 'rig', number>;

export type OutOfDateReason =
  | { kind: 'unknown-hull'; name: string }
  | { kind: 'removed-item'; name: string }
  | { kind: 'lost-slots'; rack: FittingSlotKind };

export type FitCurrency = { current: true } | { current: false; reasons: OutOfDateReason[] };

/**
 * A Tech 3 cruiser's high, mid and low slots come from its subsystems, which
 * the bare hull's counts (all zero) don't include — so they can't be counted.
 * Any other hull reading 0/0/0 is skipped the same way: missing data, not a
 * reason to call a fit out of date.
 */
function subsystemSetsRacks(parts: LoadParts & { hullTypeId: number }, slots: HullSlotCounts) {
  return (
    parts.modules.some((module) => module.slot === 'subsystem') ||
    (slots.high === 0 && slots.medium === 0 && slots.low === 0)
  );
}

/** Classifies one fit from what the EFT loader made of it and its hull's slots (`null`: unknown). */
export function classifyFitCurrency(
  parts: LoadParts,
  hullSlots: HullSlotCounts | null
): FitCurrency {
  const removed: OutOfDateReason[] = [];
  const removedNames = new Set<string>();
  const racks = new Set<FittingSlotKind>();

  for (const warning of parts.unresolved) {
    if (warning.kind === 'unknown-ship') {
      // An empty name is a missing header — a typo, not a removed hull.
      if (warning.text.trim() !== '') removed.push({ kind: 'unknown-hull', name: warning.text });
    } else if (warning.kind === 'unknown-item') {
      if (!removedNames.has(warning.text)) {
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

/** Current fits first and out-of-date ones apart, each in the order given. No verdict → current. */
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
