import type { PiData, PiPinKind } from '@/sde/types';
import { EXTRACTOR_HEADS_MAX, pinsLoad } from './pinBudget';
import type { ExtractionSlot, FitLimit, PlannerColony, PlannerPolicy } from './goalTypes';
import type { PinCounts, PinLoad } from './types';

const SECONDS_PER_HOUR = 3_600;

const CEIL_EPSILON = 1e-9;

export interface ExtractionWant {
  p0TypeId: number;
  ecus: number;
}

export type ColonyExtraction =
  | {
      status: 'fits';
      slots: ExtractionSlot[];
      pins: PinCounts;
      used: PinLoad;
      budget: PinLoad;
      runningToday?: true;
    }
  | { status: 'does-not-fit'; limitedBy: FitLimit[]; used: PinLoad; budget: PinLoad }
  | { status: 'not-extractable'; p0TypeIds: number[] }
  | { status: 'over-policy' };

export type FittedExtraction = Extract<ColonyExtraction, { status: 'fits' }>;

export interface PlannedPinFit {
  fits: boolean;
  pins: PinCounts;
  used: PinLoad;
  budget: PinLoad;
  limitedBy: FitLimit[];
}

interface BasicSchematic {
  p1TypeId: number;
  p0PerFactoryHour: number;
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

function addCounts(a: PinCounts, b: PinCounts): PinCounts {
  const out: Partial<Record<PiPinKind, number>> = { ...a };
  for (const [kind, count] of Object.entries(b) as [PiPinKind, number][]) {
    if (count) out[kind] = (out[kind] ?? 0) + count;
  }
  return out;
}

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

function runsToday(colony: PlannerColony, want: readonly ExtractionWant[]): boolean {
  const today = colony.current.ecusByP0;
  if (!today || want.length === 0) return false;
  return want.every((w) => (today.get(w.p0TypeId) ?? 0) >= w.ecus);
}

export function colonyExtraction(
  colony: PlannerColony,
  want: readonly ExtractionWant[],
  pi: PiData,
  policy: PlannerPolicy,
  fixed: PinCounts = {}
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

  const hasFixed = Object.values(fixed).some((count) => (count ?? 0) > 0);
  if (slots.length === 0 && !hasFixed) {
    const zero = { cpu: 0, powergrid: 0 };
    return { status: 'fits', slots, pins: {}, used: zero, budget: colony.budget };
  }

  const production: PinCounts =
    slots.length === 0
      ? fixed
      : addCounts(fixed, {
          extractorControlUnit: totalEcus,
          basic: slots.reduce((sum, s) => sum + s.basicFactories, 0),
        });
  const fit = fitPlannedPins(colony, production, totalEcus * headsPerExtractor, pi);
  if (!hasFixed && runsToday(colony, want)) {
    return {
      status: 'fits',
      slots,
      pins: fit.pins,
      used: fit.used,
      budget: fit.budget,
      runningToday: true,
    };
  }
  if (!fit.fits) {
    return { status: 'does-not-fit', limitedBy: fit.limitedBy, used: fit.used, budget: fit.budget };
  }
  return { status: 'fits', slots, pins: fit.pins, used: fit.used, budget: fit.budget };
}

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
