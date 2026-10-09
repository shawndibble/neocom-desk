/**
 * Jump drive legs (issue #3147): a route that mixes stargates with jump-drive
 * hops. Pure, per CLAUDE.md. A jump may start in any system but may only land
 * where a drive can target (`isUntargetable`), so a destination or waypoint
 * that cannot be jumped to is reached by gate. Whether a cyno or beacon is lit
 * there is runtime state the app cannot know; callers say so rather than
 * claim it.
 */
import {
  decayFatigue,
  isUntargetable,
  jumpFatigue,
  jumpFuel,
  lightYearDistance,
  type JumpSystem,
} from './jumpDrive';
import { CostQueue, stepCostFor, type FindJumpRouteOptions, type JumpGraph } from './jumpRoute';

/** The pilot's drive, from the hull: range, fuel per ly and fatigue distance factor. */
export interface JumpDriveOptions {
  rangeLy: number;
  fuelPerLy: number;
  distanceFactor: number;
}

/** A hull's base drive as baked: `[rangeLy, fuelTypeId, fuelPerLy]`. */
export type HullJumpDrive = readonly [number, number, number];

const BLACK_OPS_GROUP_ID = 898;
const JUMP_FREIGHTER_GROUP_ID = 902;
/** Jump Drive Calibration: +20% range a level; Jump Fuel Conservation: -10% fuel a level. */
const RANGE_GAIN_AT_V = 1 + 0.2 * 5;
const FUEL_FACTOR_AT_V = 1 - 0.1 * 5;

/**
 * A hull's drive with both skills at V, the planning assumption (no skill
 * changes fatigue: the hull's group sets the share of a jump that counts).
 */
export function hullJumpDrive(
  groupId: number,
  [rangeLy, fuelTypeId, fuelPerLy]: HullJumpDrive
): JumpDriveOptions & { fuelTypeId: number } {
  return {
    rangeLy: rangeLy * RANGE_GAIN_AT_V,
    fuelTypeId,
    fuelPerLy: fuelPerLy * FUEL_FACTOR_AT_V,
    distanceFactor:
      groupId === BLACK_OPS_GROUP_ID ? 0.25 : groupId === JUMP_FREIGHTER_GROUP_ID ? 0.1 : 1,
  };
}

export type JumpHop =
  | { kind: 'gate'; from: number; to: number }
  | { kind: 'jump'; from: number; to: number; distanceLy: number };

export type JumpLegRoute =
  { kind: 'route'; systems: number[]; hops: JumpHop[] } | { kind: 'no-route' };

/**
 * What a jump costs beside the system it lands in, in gate-hop equivalents:
 * the cyno, the fuel and the reactivation timer all weigh against a gate. A
 * jump therefore pays only where it saves more than about two gates, and
 * never turns every route into one long jump.
 */
const JUMP_FLAT_COST = 1.5;
const JUMP_COST_PER_LY = 0.05;

/** One gate hop, with the warp and align, in minutes — an estimate for the arrive time. */
const GATE_HOP_MINUTES = 1;

/**
 * The cheapest route from `from` to `to` over stargates and jump hops, or
 * `no-route` when no jump leg is on it: that is the gate way, not a way by
 * jump drive. `systems` is every system the drive knows a position for.
 */
export function routeWithJumps(
  graph: JumpGraph,
  systems: readonly JumpSystem[],
  from: number,
  to: number,
  drive: Pick<JumpDriveOptions, 'rangeLy'>,
  options: FindJumpRouteOptions = {}
): JumpLegRoute {
  if (from === to || !graph.has(from) || !graph.has(to) || !(drive.rangeLy > 0)) {
    return { kind: 'no-route' };
  }
  const byId = new Map(systems.map((system) => [system.id, system]));
  // Sorted by x, so an origin only measures the landings inside its x window.
  const landings = systems
    .filter((system) => graph.has(system.id) && !isUntargetable(system))
    .sort((a, b) => a.x - b.x);
  const firstLandingAtOrAfter = (x: number) => {
    let low = 0;
    let high = landings.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (landings[mid].x < x) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const stepCost = stepCostFor({ ...options, extraConnections: undefined, freeSystems: undefined });

  const best = new Map<number, number>([[from, 0]]);
  const cameFrom = new Map<number, { from: number; jump: boolean }>();
  const settled = new Set<number>();
  const queue = new CostQueue();
  queue.push(from, 0);
  const relax = (next: number, cost: number, via: number, jump: boolean) => {
    if (cost >= (best.get(next) ?? Number.POSITIVE_INFINITY)) return;
    best.set(next, cost);
    cameFrom.set(next, { from: via, jump });
    queue.push(next, cost);
  };

  for (let top = queue.pop(); top !== undefined; top = queue.pop()) {
    const { systemId, cost } = top;
    if (settled.has(systemId)) continue;
    settled.add(systemId);
    if (systemId === to) break;
    for (const neighbour of graph.get(systemId) ?? []) {
      if (graph.has(neighbour))
        relax(neighbour, cost + stepCost(neighbour, false), systemId, false);
    }
    const origin = byId.get(systemId);
    if (!origin) continue;
    for (let at = firstLandingAtOrAfter(origin.x - drive.rangeLy); at < landings.length; at += 1) {
      const landing = landings[at];
      if (landing.x > origin.x + drive.rangeLy) break;
      if (landing.id === systemId || settled.has(landing.id)) continue;
      const distanceLy = lightYearDistance(origin, landing);
      if (distanceLy > drive.rangeLy) continue;
      relax(
        landing.id,
        cost + JUMP_FLAT_COST + JUMP_COST_PER_LY * distanceLy + stepCost(landing.id, false),
        systemId,
        true
      );
    }
  }
  if (!settled.has(to)) return { kind: 'no-route' };

  const path: number[] = [];
  const hops: JumpHop[] = [];
  for (let id = to; ;) {
    path.push(id);
    const step = cameFrom.get(id);
    if (!step) break;
    const a = byId.get(step.from);
    const b = byId.get(id);
    hops.push(
      step.jump && a && b
        ? { kind: 'jump', from: step.from, to: id, distanceLy: lightYearDistance(a, b) }
        : { kind: 'gate', from: step.from, to: id }
    );
    id = step.from;
  }
  path.reverse();
  hops.reverse();
  if (!hops.some((hop) => hop.kind === 'jump')) return { kind: 'no-route' };
  return { kind: 'route', systems: path, hops };
}

export interface JumpWayFacts {
  jumps: number;
  totalLy: number;
  fuel: number;
  /** Fatigue left on the pilot after the last jump, in minutes. */
  fatigueMinutes: number;
  /** Minutes from departure to arrival: the timers waited out between jumps, plus the gates. */
  arriveMinutes: number;
}

/**
 * The fuel, light years, fatigue and time a route's jump hops cost. The
 * pilot starts with no fatigue; fatigue decays with the reactivation wait
 * between one jump and the next.
 */
export function jumpWayFacts(
  hops: readonly JumpHop[],
  drive: Pick<JumpDriveOptions, 'fuelPerLy' | 'distanceFactor'>
): JumpWayFacts {
  let jumps = 0;
  let totalLy = 0;
  let fuel = 0;
  let fatigue = 0;
  let wait = 0;
  let minutes = 0;
  let gateMinutes = 0;
  for (const hop of hops) {
    if (hop.kind === 'gate') {
      gateMinutes += GATE_HOP_MINUTES;
      continue;
    }
    jumps += 1;
    totalLy += hop.distanceLy;
    fuel += jumpFuel(hop.distanceLy, drive.fuelPerLy);
    // The previous jump's timer runs while the gates in between are flown.
    minutes += Math.max(wait, gateMinutes);
    gateMinutes = 0;
    fatigue = decayFatigue(fatigue, wait);
    const result = jumpFatigue({
      fatigueMinutes: fatigue,
      distanceLy: hop.distanceLy,
      distanceFactor: drive.distanceFactor,
    });
    fatigue = result.fatigueMinutes;
    wait = result.cooldownMinutes;
  }
  return { jumps, totalLy, fuel, fatigueMinutes: fatigue, arriveMinutes: minutes + gateMinutes };
}
