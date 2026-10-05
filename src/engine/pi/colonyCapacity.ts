/**
 * What one colony can extract and refine to P1, fitted against its own
 * CPU/Powergrid — the single capacity model the goal planner, the Baseline and
 * the factory host all read, so the three can never disagree about what fits.
 *
 * ## An extraction slot refines on the spot
 *
 * Every slot is ECUs on one P0 plus the Basic Industry Facilities that turn it
 * into its P1 on the same planet. Raw P0 never leaves the colony: at 0.005 m3
 * and a customs value of 5 ISK it is worth hauling only as P1, and every
 * Baseline and Goal Plan figure assumes the refined product. The basic count
 * is read off the schematic's own input and cycle (3000 per 1800 s, so one
 * basic eats 6000 P0/h) — no rate is written here.
 *
 * A second ECU on the *same* P0 yields `policy.extraEcuFactor` of the first:
 * two programs on one resource compete for the same hot spots. A second ECU on
 * a *different* P0 is credited in full — it is a second slot, not a second
 * program on the first slot's resource.
 *
 * ## The fit is on the combined pin set
 *
 * Two slots share one Command Center, so they are fitted together: ECUs, their
 * heads (`headsPerExtractor` each, `pinsLoad`'s total-heads convention), every
 * basic, and one Launchpad. The budget a `PlannerColony` carries is the whole
 * Command Center supply — the plan rebuilds the production pins — so the
 * Launchpad's own load is charged here, unlike `fitColony`, whose caller has
 * already subtracted an existing pad.
 *
 * Links follow `fitColony`'s per-pin rule: one `newLinkCost` for every planned
 * pin except the Launchpad. A colony's links form a tree rooted at the pad, so
 * N pins need N − 1 links, and that is exactly "every pin but the pad".
 *
 * Pure: `PiData`, the colony and the policy are parameters.
 */

import type { PiData, PiPinKind } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX, pinsLoad } from './pinBudget';
import type { ExtractionSlot, FitLimit, PlannerColony, PlannerPolicy } from './goalTypes';
import type { PinCounts, PinLoad } from './types';

const SECONDS_PER_HOUR = 3_600;

/** The same drift guard `chain.ts` uses, so 6000/6000 is one basic, not two. */
const CEIL_EPSILON = 1e-9;

/** One P0 and how many ECUs to put on it. */
export interface ExtractionWant {
  p0TypeId: number;
  ecus: number;
}

export type ColonyExtraction =
  | {
      status: 'fits';
      /** Sorted by P0 typeId. */
      slots: ExtractionSlot[];
      pins: PinCounts;
      used: PinLoad;
      budget: PinLoad;
    }
  | { status: 'does-not-fit'; limitedBy: FitLimit[]; used: PinLoad; budget: PinLoad }
  /** P0s this colony's planet type does not yield (no rate on the colony). Sorted. */
  | { status: 'not-extractable'; p0TypeIds: number[] }
  /** More ECUs or more distinct P0s than `PlannerPolicy` allows. */
  | { status: 'over-policy' };

export type FittedExtraction = Extract<ColonyExtraction, { status: 'fits' }>;

export interface PlannedPinFit {
  fits: boolean;
  /** The production pins plus the one Launchpad. */
  pins: PinCounts;
  /** Pins, heads and links together. */
  used: PinLoad;
  budget: PinLoad;
  /** The axes `used` overruns. Empty when it fits. */
  limitedBy: FitLimit[];
}

interface BasicSchematic {
  p1TypeId: number;
  /** P0 one basic consumes an hour. */
  p0PerFactoryHour: number;
  /** P1 out per P0 in. */
  yieldRatio: number;
}

function basicSchematicFor(p0TypeId: number, pi: PiData): BasicSchematic | null {
  for (const [id, schematic] of Object.entries(pi.schematics)) {
    if (schematic.inputs.length !== 1 || schematic.inputs[0].typeID !== p0TypeId) continue;
    const input = schematic.inputs[0];
    return {
      p1TypeId: Number(id),
      p0PerFactoryHour: (input.quantity * SECONDS_PER_HOUR) / schematic.cycleTime,
      yieldRatio: schematic.quantity / input.quantity,
    };
  }
  return null;
}

/** The P1 a P0 refines into: the basic schematic whose single input it is. Null when none does. */
export function p1ForP0(p0TypeId: number, pi: PiData): number | null {
  return basicSchematicFor(p0TypeId, pi)?.p1TypeId ?? null;
}

function addCounts(a: PinCounts, b: PinCounts): PinCounts {
  const out: Partial<Record<PiPinKind, number>> = { ...a };
  for (const [kind, count] of Object.entries(b) as [PiPinKind, number][]) {
    if (count) out[kind] = (out[kind] ?? 0) + count;
  }
  return out;
}

/**
 * Fit a set of production pins on `colony`: adds the one Launchpad and a link
 * per non-pad pin, and checks the total against the whole Command Center
 * supply. The extraction slots and the factory host both go through here.
 */
export function fitPlannedPins(
  colony: PlannerColony,
  production: PinCounts,
  extractorHeads: number,
  pi: PiData
): PlannedPinFit {
  const pins = addCounts(production, { launchpad: 1 });
  const linked = Object.entries(production).reduce((sum, [, count]) => sum + (count ?? 0), 0);
  const load = pinsLoad(pins, pi.infrastructure, { extractorHeads });
  const used = {
    cpu: load.cpu + colony.newLinkCost.cpu * linked,
    powergrid: load.powergrid + colony.newLinkCost.powergrid * linked,
  };
  const limitedBy: FitLimit[] = [];
  if (used.cpu > colony.budget.cpu + CEIL_EPSILON) limitedBy.push('cpu');
  if (used.powergrid > colony.budget.powergrid + CEIL_EPSILON) limitedBy.push('powergrid');
  return { fits: limitedBy.length === 0, pins, used, budget: colony.budget, limitedBy };
}

/**
 * Fit `want` — one or two P0s with their ECU counts — on `colony`, refining
 * each to its P1 on the spot.
 *
 * Checked in order: a P0 the colony has no rate for (`not-extractable`), then
 * the policy caps (`over-policy`), then CPU/Powergrid (`does-not-fit`). An
 * empty `want` fits with no pins at all — an unused colony builds nothing,
 * not even a pad.
 */
export function colonyExtraction(
  colony: PlannerColony,
  want: readonly ExtractionWant[],
  pi: PiData,
  policy: PlannerPolicy
): ColonyExtraction {
  const { headsPerExtractor } = colony;
  if (
    !Number.isInteger(headsPerExtractor) ||
    headsPerExtractor < 0 ||
    headsPerExtractor > EXTRACTOR_HEADS_MAX
  ) {
    throw new Error(
      `an Extractor Control Unit carries 0-${EXTRACTOR_HEADS_MAX} heads, got ${headsPerExtractor}`
    );
  }
  const seen = new Set<number>();
  for (const w of want) {
    if (!Number.isInteger(w.ecus) || w.ecus < 1) {
      throw new Error(`an extraction slot needs a whole number of ECUs, got ${w.ecus}`);
    }
    if (seen.has(w.p0TypeId))
      throw new Error(`P0 ${w.p0TypeId} appears twice in one colony's want`);
    seen.add(w.p0TypeId);
  }

  const missing = want
    .filter((w) => !colony.ratePerEcu.has(w.p0TypeId))
    .map((w) => w.p0TypeId)
    .sort((a, b) => a - b);
  if (missing.length > 0) return { status: 'not-extractable', p0TypeIds: missing };

  const totalEcus = want.reduce((sum, w) => sum + w.ecus, 0);
  if (totalEcus > policy.maxEcusPerColony || want.length > policy.maxP0TypesPerColony) {
    return { status: 'over-policy' };
  }

  const slots: ExtractionSlot[] = [...want]
    .sort((a, b) => a.p0TypeId - b.p0TypeId)
    .map((w) => {
      const basic = basicSchematicFor(w.p0TypeId, pi);
      if (!basic) throw new Error(`no basic schematic refines P0 ${w.p0TypeId}`);
      // `has` above guarantees the rate.
      const rate = colony.ratePerEcu.get(w.p0TypeId)!;
      const p0PerHour = rate.unitsPerHour * (1 + policy.extraEcuFactor * (w.ecus - 1));
      return {
        p0TypeId: w.p0TypeId,
        p1TypeId: basic.p1TypeId,
        ecus: w.ecus,
        p0PerHour,
        p1PerHour: p0PerHour * basic.yieldRatio,
        basicFactories: Math.ceil(p0PerHour / basic.p0PerFactoryHour - CEIL_EPSILON),
        rateSource: rate.source,
      };
    });

  if (slots.length === 0) {
    const zero = { cpu: 0, powergrid: 0 };
    return { status: 'fits', slots, pins: {}, used: zero, budget: colony.budget };
  }

  const production: PinCounts = {
    extractorControlUnit: totalEcus,
    basic: slots.reduce((sum, s) => sum + s.basicFactories, 0),
  };
  const fit = fitPlannedPins(colony, production, totalEcus * headsPerExtractor, pi);
  if (!fit.fits) {
    return { status: 'does-not-fit', limitedBy: fit.limitedBy, used: fit.used, budget: fit.budget };
  }
  return { status: 'fits', slots, pins: fit.pins, used: fit.used, budget: fit.budget };
}

/**
 * Every extraction this colony can run within the policy, fitted: each P0 at
 * 1..`maxEcusPerColony` ECUs, then — when the policy allows two types — each
 * pair of P0s split every way the ECU cap allows. Ordered singles first, by
 * P0 then ECUs, then pairs, so a caller breaking ties by position is
 * deterministic.
 */
export function extractionOptions(
  colony: PlannerColony,
  pi: PiData,
  policy: PlannerPolicy
): FittedExtraction[] {
  const p0s = [...colony.ratePerEcu.keys()].sort((a, b) => a - b);
  const wants: ExtractionWant[][] = [];
  for (const p0TypeId of p0s) {
    for (let ecus = 1; ecus <= policy.maxEcusPerColony; ecus++) wants.push([{ p0TypeId, ecus }]);
  }
  if (policy.maxP0TypesPerColony >= 2) {
    for (let i = 0; i < p0s.length; i++) {
      for (let j = i + 1; j < p0s.length; j++) {
        for (let a = 1; a < policy.maxEcusPerColony; a++) {
          for (let b = 1; a + b <= policy.maxEcusPerColony; b++) {
            wants.push([
              { p0TypeId: p0s[i], ecus: a },
              { p0TypeId: p0s[j], ecus: b },
            ]);
          }
        }
      }
    }
  }
  const out: FittedExtraction[] = [];
  for (const want of wants) {
    const result = colonyExtraction(colony, want, pi, policy);
    if (result.status === 'fits') out.push(result);
  }
  return out;
}

/** The most ECUs (up to the policy cap) on one P0 that fit on this colony, or null when not even one does. */
export function bestSingleSlotFit(
  colony: PlannerColony,
  p0TypeId: number,
  pi: PiData,
  policy: PlannerPolicy
): FittedExtraction | null {
  for (let ecus = policy.maxEcusPerColony; ecus >= 1; ecus--) {
    const result = colonyExtraction(colony, [{ p0TypeId, ecus }], pi, policy);
    if (result.status === 'fits') return result;
  }
  return null;
}
