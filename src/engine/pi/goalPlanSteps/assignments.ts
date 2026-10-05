/**
 * Step 7 of `planGoals`: every colony's role in the final plan. A used colony
 * with room sells one more slot; a colony the plan leaves alone keeps its
 * **Baseline**; only one with nothing worth selling is idle.
 */
import type { PiData } from '@/sde/types';
import { bidOf, p1NetPerUnit, type ColonyBaseline } from '../baseline';
import {
  colonyExtraction,
  fitPlannedPins,
  type ExtractionWant,
  type FittedExtraction,
} from '../colonyCapacity';
import type {
  ColonyAssignment,
  ExtractionSlot,
  PlannerColony,
  PlannerPolicy,
  PriceBooks,
} from '../goalTypes';
import type { PinCounts } from '../types';
import type { Wants } from './extraction';
import { EPSILON, byId } from './shared';

/**
 * The best-selling extra slot `colony` can add beside `current` (and its
 * `fixed` factories), or null when none fits or none is priced. A P0 already
 * in `current` is not offered again: its ECU count was the solver's call.
 */
export function spareSlot(
  colony: PlannerColony,
  current: readonly ExtractionWant[],
  fixed: PinCounts,
  policy: PlannerPolicy,
  books: PriceBooks,
  pi: PiData
): FittedExtraction | null {
  if (current.length >= policy.maxP0TypesPerColony) return null;
  const ecusLeft = policy.maxEcusPerColony - current.reduce((s, w) => s + w.ecus, 0);
  let best: { fit: FittedExtraction; isk: number } | null = null;
  for (const p0 of [...colony.ratePerEcu.keys()].sort(byId)) {
    if (current.some((w) => w.p0TypeId === p0)) continue;
    for (let ecus = ecusLeft; ecus >= 1; ecus--) {
      const fit = colonyExtraction(colony, [...current, { p0TypeId: p0, ecus }], pi, policy, fixed);
      if (fit.status !== 'fits') continue;
      const slot = fit.slots.find((s) => s.p0TypeId === p0)!;
      const bid = bidOf(books, slot.p1TypeId);
      if (bid === undefined) break;
      const isk = slot.p1PerHour * p1NetPerUnit(bid, colony, books);
      if (isk > EPSILON && (best === null || isk > best.isk)) best = { fit, isk };
      break;
    }
  }
  return best?.fit ?? null;
}

export interface Assigned {
  /** One per colony, by planet id. */
  assignments: ColonyAssignment[];
  /** The spare slot each used colony sells, by planet id. */
  spare: Map<number, ExtractionSlot>;
}

/**
 * Roles for every colony on the final extraction. `host` and `hostFactories`
 * are the settled host (step 5), which may be null.
 */
export function assignColonies(args: {
  /** By planet id. */
  colonies: readonly PlannerColony[];
  wants: Wants;
  host: PlannerColony | null;
  hostFactories: PinCounts;
  baselines: ReadonlyMap<number, ColonyBaseline>;
  policy: PlannerPolicy;
  books: PriceBooks;
  pi: PiData;
}): Assigned {
  const { colonies, wants, host, hostFactories, baselines, policy, books, pi } = args;
  const fixedOn = (c: PlannerColony): PinCounts => (c === host ? hostFactories : {});
  const fitted = new Map<number, FittedExtraction>();
  for (const c of colonies) {
    const want = wants.get(c.planetId);
    if (!want) continue;
    const fit = colonyExtraction(c, want, pi, policy, fixedOn(c));
    if (fit.status === 'fits') fitted.set(c.planetId, fit);
  }
  const spare = new Map<number, ExtractionSlot>();
  const assignments = colonies.map((c): ColonyAssignment => {
    const isHost = c === host;
    let fit = fitted.get(c.planetId) ?? null;
    if (fit || isHost) {
      const current = wants.get(c.planetId) ?? [];
      const extra = spareSlot(c, current, fixedOn(c), policy, books, pi);
      if (extra) {
        const added = extra.slots.find((s) => !current.some((w) => w.p0TypeId === s.p0TypeId))!;
        spare.set(c.planetId, added);
        fit = extra;
      }
    }
    if (isHost) {
      const pinFit = fit ?? fitPlannedPins(c, hostFactories, 0, pi);
      return {
        planetId: c.planetId,
        role: 'factory',
        slots: fit?.slots ?? [],
        factories: hostFactories,
        pins: pinFit.pins,
        used: pinFit.used,
        budget: pinFit.budget,
        limitedBy: [],
        ...(fit?.runningToday ? { runningToday: true as const } : {}),
      };
    }
    if (fit) {
      return {
        planetId: c.planetId,
        role: 'extract',
        slots: fit.slots,
        factories: {},
        pins: fit.pins,
        used: fit.used,
        budget: fit.budget,
        limitedBy: [],
        ...(fit.runningToday ? { runningToday: true as const } : {}),
      };
    }
    const own = baselines.get(c.planetId);
    if (own?.status === 'ok' && own.slots.length > 0) {
      // The Baseline was picked from fitting options, so this refit fits.
      const keep = colonyExtraction(
        c,
        own.slots.map((s) => ({ p0TypeId: s.p0TypeId, ecus: s.ecus })),
        pi,
        policy
      ) as FittedExtraction;
      return {
        planetId: c.planetId,
        role: 'baseline',
        slots: own.slots,
        factories: {},
        pins: keep.pins,
        used: keep.used,
        budget: keep.budget,
        limitedBy: [],
        ...(keep.runningToday ? { runningToday: true as const } : {}),
      };
    }
    return {
      planetId: c.planetId,
      role: 'idle',
      slots: [],
      factories: {},
      pins: {},
      used: { cpu: 0, powergrid: 0 },
      budget: c.budget,
      limitedBy: [],
    };
  });
  return { assignments, spare };
}
