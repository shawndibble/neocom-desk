/**
 * Turn a parsed EFT fit into the Build Plans a **Build Group** should hold
 * (issue #626, "Fit Import" in CONTEXT.md).
 *
 * The counterpart of `fitToSkills.ts`: same input, same injected-lookup shape,
 * and the same promise that no *input* can make it throw — a malformed fit,
 * an unresolvable name and a missing header all come back as data. It answers
 * "what do I have to build" rather than "what do I have to train". Pure, like everything in `src/engine`: the
 * caller adapts the blueprint catalog to `FitBlueprintLookup` at the boundary.
 *
 * ## One aggregation pass, not two
 *
 * A fit expresses quantity two different ways, and both occur in one paste:
 * one line per copy fitted (two `Inertial Stabilizers II` lines mean two
 * modules) and an `xN` suffix on drone-bay/cargo lines. `parseEftFit` emits
 * one item per line and deliberately does not merge them — it is scoped to
 * text structure, and `clipboardImport` counts its lines to build a shipped
 * warning. So merging happens here.
 *
 * It happens exactly once, keyed by `blueprintTypeID` where the name resolved
 * and by the lower-cased name where it did not. Keying by the resolved
 * blueprint subsumes keying by name — two spellings of one type merge a
 * fortiori — so a separate name-keyed pre-pass would only be a second place
 * for one merge rule to be wrong.
 *
 * ## What it refuses to guess
 *
 * A faction, named or meta module has no blueprint at all, and roughly a fifth
 * of a routine fit is one of those. Those are *reported*, with the quantity
 * they were asked for, never dropped — the pilot needs to know what the group
 * does not cover.
 */

import { MAX_JOB_RUNS } from '../industry/types';
import type { EftFit, EftItem } from './eftFit';

/** What the caller's blueprint catalog has to answer for one item name. */
export interface FitBlueprintResolution {
  blueprintTypeID: number;
  productTypeID: number;
  /** The catalog's own name for the product, preferred over the fit's spelling. */
  productName: string;
  /** Units one run of the blueprint produces. Ammo and drones make many. */
  unitsPerRun: number;
}

/** Resolves an item name to the blueprint that makes it, or null when nothing does. */
export type FitBlueprintLookup = (itemName: string) => FitBlueprintResolution | null;

/** One Build Plan the import will create. */
export interface FitBuildCandidate {
  blueprintTypeID: number;
  productTypeID: number;
  productName: string;
  /** Units the fit calls for, summed across every line naming this item. */
  quantity: number;
  /** Whole runs needed to make `quantity`, at least 1 and at most `MAX_RUNS`. */
  runs: number;
  /**
   * Units the batch size forces the pilot to overproduce (`runs * unitsPerRun
   * - quantity`). Named for `BuildRecipe.spare`, which already means exactly
   * this, rather than coining a second word for one idea.
   */
  spare: number;
}

/** An item the group cannot cover, and how many of it were asked for. */
export interface FitSkippedItem {
  name: string;
  quantity: number;
}

export interface FitToBuildPlansResult {
  /**
   * The hull, or null when the header could not be read — `shipName` and
   * `fitName` are written together or not at all, so an unreadable header
   * costs the ship too. Kept apart from `items` so the caller can give it the
   * newest `updatedAt` of the batch, which decides what the pilot's *next*
   * hand-made plan defaults from (issue #456).
   */
  hull: FitBuildCandidate | null;
  /** Every other buildable item, in first-appearance order. */
  items: FitBuildCandidate[];
  /** Named items with no blueprint — reported, never silently dropped. */
  skipped: FitSkippedItem[];
  /** Charges withheld by default, so the dialog can say so. Empty when `includeCharges`. */
  excludedCharges: FitSkippedItem[];
  /**
   * The fit name from the `[Ship, Fit]` header, or null when it could not be
   * read — which also means no `hull`, since the parser writes both header
   * names together or neither. Callers test this rather than a second
   * `headerFailed` flag that could only ever say the same thing.
   */
  groupName: string | null;
}

export interface FitToBuildPlansOptions {
  /**
   * Include ammo a module was left loaded with. Off by default: EFT gives a
   * charge its module line's quantity, so eight launchers reads as eight
   * missiles — a launcher count, not a batch. When on, a charge is quoted at
   * one full blueprint run, because the pilot knows their ammo stockpile and
   * this module does not.
   */
  includeCharges?: boolean;
}

/**
 * Whole runs to make `quantity`, clamped exactly as the plan itself will be (`MAX_JOB_RUNS`).
 *
 * `computeBuildPlan` clamps runs to [1, 100_000] before computing anything, so
 * a larger number stored here would *display* as itself while every figure on
 * the page came from the clamp — the plan silently disagreeing with its own
 * headline. Clamping at the point of creation keeps the two the same number.
 */
function runsFor(quantity: number, unitsPerRun: number): number {
  const perRun = unitsPerRun > 0 ? unitsPerRun : 1;
  return Math.min(MAX_JOB_RUNS, Math.max(1, Math.ceil(quantity / perRun)));
}

function candidateFor(resolution: FitBlueprintResolution, quantity: number): FitBuildCandidate {
  const runs = runsFor(quantity, resolution.unitsPerRun);
  const perRun = resolution.unitsPerRun > 0 ? resolution.unitsPerRun : 1;
  return {
    blueprintTypeID: resolution.blueprintTypeID,
    productTypeID: resolution.productTypeID,
    productName: resolution.productName,
    quantity,
    runs,
    // Never negative: a clamped run count can leave the batch short of what
    // the fit asked for, which is a shortfall rather than a surplus, and the
    // clamp itself is what the pilot needs told in that case.
    spare: Math.max(0, runs * perRun - quantity),
  };
}

export function fitToBuildPlans(
  fit: EftFit,
  lookup: FitBlueprintLookup,
  { includeCharges = false }: FitToBuildPlansOptions = {}
): FitToBuildPlansResult {
  // Both header names are assigned together inside the parser's single
  // `if (headerMatch)` branch, so either both are set or neither is. Testing
  // one is testing both.
  const headerFailed = fit.shipName === '';

  const resolved = new Map<number, { resolution: FitBlueprintResolution; quantity: number }>();
  const order: number[] = [];
  const skipped = new Map<string, FitSkippedItem>();
  const excludedCharges = new Map<string, FitSkippedItem>();

  function addSkipped(into: Map<string, FitSkippedItem>, item: EftItem) {
    const key = item.name.toLowerCase();
    const existing = into.get(key);
    if (existing) existing.quantity += item.quantity;
    else into.set(key, { name: item.name, quantity: item.quantity });
  }

  function addResolved(resolution: FitBlueprintResolution, quantity: number) {
    const existing = resolved.get(resolution.blueprintTypeID);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    resolved.set(resolution.blueprintTypeID, { resolution, quantity });
    order.push(resolution.blueprintTypeID);
  }

  for (const item of fit.items) {
    if (item.isCharge && !includeCharges) {
      addSkipped(excludedCharges, item);
      continue;
    }
    const resolution = lookup(item.name);
    if (!resolution) {
      addSkipped(skipped, item);
      continue;
    }
    // An included charge is quoted at one batch, not at its module count —
    // see `includeCharges`. The quantity it was named with is deliberately
    // discarded rather than scaled, because it counts modules.
    addResolved(resolution, item.isCharge ? resolution.unitsPerRun : item.quantity);
  }

  const hullResolution = headerFailed ? null : lookup(fit.shipName);
  if (!headerFailed && !hullResolution) {
    addSkipped(skipped, { name: fit.shipName, quantity: 1 });
  }

  return {
    hull: hullResolution ? candidateFor(hullResolution, 1) : null,
    // `order` only ever gains an id that `resolved` was given in the same
    // statement, so every lookup here hits. Filtered rather than asserted:
    // this module promises callers that no input can make it throw, and an
    // invariant of its own is not worth breaking that promise over.
    items: order.flatMap((id) => {
      const entry = resolved.get(id);
      return entry ? [candidateFor(entry.resolution, entry.quantity)] : [];
    }),
    skipped: [...skipped.values()],
    excludedCharges: [...excludedCharges.values()],
    groupName: headerFailed ? null : fit.fitName,
  };
}
