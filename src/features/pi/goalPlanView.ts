/**
 * Readings of a solved Goal Plan the page shows but the engine does not
 * compute: how many goals are met, which figures rest on estimates, each
 * colony's change as concrete setup steps, and a named fix for a shortfall.
 *
 * Pure: the plan, the change list and the planner rows are parameters.
 */
import type { ColonyBaseline } from '@/engine/pi/baseline';
import type {
  ColonyAssignment,
  ExtractionSlot,
  FlowEnd,
  GoalPlan,
  PlanetType,
  RateSource,
  Shortfall,
} from '@/engine/pi/goalTypes';
import type { ColonyChange } from '@/engine/pi/planDiff';
import type { PlannerColonyRow } from './goalPlannerModel';

/** Below this short of one, a goal's fraction is float dust, not a miss. */
const MET = 0.999;
const HOURS_PER_DAY = 24;

export interface GoalAttainment {
  met: number;
  total: number;
  unmet: { typeId: number; fraction: number }[];
}

export function goalAttainment(achieved: GoalPlan['achieved']): GoalAttainment {
  const unmet = achieved
    .filter((goal) => goal.fraction < MET)
    .map((goal) => ({ typeId: goal.typeId, fraction: goal.fraction }));
  return { met: achieved.length - unmet.length, total: achieved.length, unmet };
}

export interface PlanCaveats {
  /** Colonies with a slot whose rate is an estimate — see `slotEstimate`. */
  estimatedRates: number[];
  /** Enabled colonies costed at an assumed customs rate (nobody set theirs). */
  assumedCustoms: number[];
  /** Types the plan or the Baseline sells at the hub's ask: it has no buy order for them. */
  valuedAtAsk: number[];
}

/** What is sold at the hub, and which of the hub's bids are really asks. */
export interface PlanSales {
  flows: GoalPlan['flows'];
  baseline: ReadonlyMap<number, ColonyBaseline>;
  valuedAtAsk: ReadonlySet<number>;
}

/**
 * Why a slot's rate is an estimate, or null when it is this colony's own
 * measured program as it runs today. A measured rate on a different ECU count
 * is an estimate too: the planner scales a second ECU by its extra-ECU yield
 * factor, so the per-ECU figure measured today no longer holds as measured.
 * `ecusToday` is what the colony runs on that P0 now; unknown leaves a
 * measured rate standing.
 */
export type SlotEstimate = Exclude<RateSource, 'measured'> | 'ecus-changed';

export function slotEstimate(
  slot: ExtractionSlot,
  ecusToday: number | undefined
): SlotEstimate | null {
  if (slot.rateSource !== 'measured') return slot.rateSource;
  return ecusToday !== undefined && ecusToday !== slot.ecus ? 'ecus-changed' : null;
}

export function planCaveats(
  assignments: readonly ColonyAssignment[],
  rows: readonly PlannerColonyRow[],
  sales?: PlanSales
): PlanCaveats {
  const sold = new Set<number>();
  for (const flow of sales?.flows ?? [])
    if (flow.to === 'hub' && flow.from !== 'hub') sold.add(flow.typeId);
  for (const own of sales?.baseline.values() ?? []) {
    if (own.status === 'ok') for (const slot of own.slots) sold.add(slot.p1TypeId);
  }
  const ecusToday = new Map(rows.map((row) => [row.planetId, row.colony?.current.ecusByP0]));
  return {
    estimatedRates: assignments
      .filter((a) =>
        a.slots.some(
          (slot) => slotEstimate(slot, ecusToday.get(a.planetId)?.get(slot.p0TypeId)) !== null
        )
      )
      .map((a) => a.planetId)
      .sort((a, b) => a - b),
    assumedCustoms: rows
      .filter((row) => row.enabled && row.taxAssumed)
      .map((row) => row.planetId)
      .sort((a, b) => a - b),
    valuedAtAsk: sorted([...sold].filter((id) => sales?.valuedAtAsk.has(id))),
  };
}

export type StepKind = 'as-is' | 'start' | 'add' | 'stop' | 'retarget' | 'host' | 'idle';

export interface ColonyStep {
  planetId: number;
  kind: StepKind;
  /** The extraction to set up: ECUs on each P0, and the basics refining it. */
  extract: { p0TypeId: number; p1TypeId: number; ecus: number; basicFactories: number }[];
  /** P0s to stop extracting, with how many ECUs run each today. */
  stop: { p0TypeId: number; ecus: number }[];
  /** Host only: factories to set, by the product they make. */
  factories: { typeId: number; count: number }[];
  /**
   * Where this colony's output goes: another colony by id, or the hub.
   * `isNew` marks a leg to another colony — a colony left alone only sells,
   * so routing to a colony is a change even when its extraction is not.
   */
  ships: { typeId: number; to: FlowEnd; isNew: boolean }[];
  /** A colony the plan has no role for: left as it is, selling its best P1. */
  notNeeded: boolean;
  /**
   * Not needed, and its best P1 is not what it runs today: an optional tip
   * (switch to these), never a step. Empty when it already does.
   */
  switchTo: number[];
}

function sorted(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** One step per change, in the change list's order. */
export function changeSteps(
  plan: Pick<GoalPlan, 'assignments' | 'demand' | 'flows' | 'factoryHost'>,
  changes: readonly ColonyChange[],
  rows: readonly PlannerColonyRow[]
): ColonyStep[] {
  const assignmentOf = new Map(plan.assignments.map((a) => [a.planetId, a]));
  const rowOf = new Map(rows.map((row) => [row.planetId, row]));
  return changes.map((change): ColonyStep => {
    const assignment = assignmentOf.get(change.planetId);
    const slots = assignment?.slots ?? [];
    const extract = slots.map((slot) => ({
      p0TypeId: slot.p0TypeId,
      p1TypeId: slot.p1TypeId,
      ecus: slot.ecus,
      basicFactories: slot.basicFactories,
    }));
    const shipped = new Map<string, { typeId: number; to: FlowEnd; isNew: boolean }>();
    for (const flow of plan.flows) {
      if (flow.from !== change.planetId || flow.to === change.planetId) continue;
      shipped.set(`${flow.typeId}:${flow.to}`, {
        typeId: flow.typeId,
        to: flow.to,
        isNew: flow.to !== 'hub',
      });
    }
    const ships = [...shipped.values()];
    const today = rowOf.get(change.planetId)?.colony?.current;
    const stopping = (p0s: readonly number[]) =>
      p0s.map((p0TypeId) => ({ p0TypeId, ecus: today?.ecusByP0?.get(p0TypeId) ?? 1 }));
    const base = {
      planetId: change.planetId,
      extract,
      stop: [],
      factories: [],
      ships,
      notNeeded: false,
      switchTo: [],
    };

    switch (change.verb) {
      case 'keep': {
        if (!change.notNeeded) return { ...base, kind: 'as-is' };
        // Its Baseline's P1s, against the P1s its current P0s refine to.
        const running = new Set(today?.p0TypeIds ?? []);
        const differs = slots.some((slot) => !running.has(slot.p0TypeId));
        return {
          ...base,
          kind: 'as-is',
          notNeeded: true,
          switchTo: differs ? sorted(slots.map((slot) => slot.p1TypeId)) : [],
        };
      }
      case 'add-extractor':
        return { ...base, kind: 'add' };
      case 'retarget': {
        if (change.from.length === 0) return { ...base, kind: 'start' };
        const dropped = change.from.filter((id) => !change.to.includes(id));
        const onlyDrops = change.to.length > 0 && change.to.every((id) => change.from.includes(id));
        return { ...base, kind: onlyDrops ? 'stop' : 'retarget', stop: stopping(dropped) };
      }
      case 'convert-to-factory': {
        const factories = plan.demand
          .filter((line) => line.tier >= 2 && line.source === 'made' && line.factories)
          .map((line) => ({ typeId: line.typeId, count: line.factories as number }));
        const kept = new Set(slots.map((slot) => slot.p0TypeId));
        return {
          ...base,
          kind: 'host',
          factories,
          stop: stopping(change.from.filter((id) => !kept.has(id))),
        };
      }
      case 'idle':
        return { ...base, kind: 'idle' };
    }
  });
}

export type ShortfallHint =
  | { kind: 'switched-off'; planetIds: number[] }
  | { kind: 'retarget'; planetIds: number[] }
  | { kind: 'buy' }
  | null;

/** A named fix for a shortfall, where the page can offer one. */
export function shortfallHint(
  shortfall: Shortfall,
  rows: readonly PlannerColonyRow[],
  buyP1: boolean
): ShortfallHint {
  switch (shortfall.kind) {
    case 'type-gap': {
      const off = rows
        .filter(
          (row) =>
            !row.enabled &&
            row.excluded === null &&
            shortfall.fixPlanetTypes.includes(row.planetType)
        )
        .map((row) => row.planetId);
      return off.length > 0 ? { kind: 'switched-off', planetIds: sorted(off) } : null;
    }
    case 'budget-gap': {
      if (buyP1) return { kind: 'buy' };
      // The engine's own candidates: colonies that yield it and are not
      // already at the ECU cap on it.
      const able = shortfall.retargetCandidates;
      return able.length > 0 ? { kind: 'retarget', planetIds: sorted(able) } : { kind: 'buy' };
    }
    default:
      return null;
  }
}

/**
 * What switching a colony to its best P1 alone would gain over what it earns
 * now, ISK/day. Null when either side is unknown: no priced Baseline, or no
 * measured extraction to price today's earnings from.
 */
export function switchGainPerDay(
  planetId: number,
  baseline: ReadonlyMap<number, ColonyBaseline>,
  earningsByPlanet: ReadonlyMap<number, number | null>
): number | null {
  const own = baseline.get(planetId);
  const now = earningsByPlanet.get(planetId);
  return own?.status === 'ok' && now != null ? (own.iskPerHour - now) * HOURS_PER_DAY : null;
}

/** Each type gap's P0, to the planet types that would yield it. */
export function typeGapPlanetTypes(
  shortfalls: readonly Shortfall[]
): Map<number, readonly PlanetType[]> {
  return new Map(
    shortfalls.flatMap((gap) =>
      gap.kind === 'type-gap' ? [[gap.p0TypeId, gap.fixPlanetTypes] as const] : []
    )
  );
}
