/**
 * How long a route takes to fly by gate (issue #6282), for the ship being
 * moved. Two figures, both estimates for a base hull with skills at V:
 *
 * - **warp to 0**: per gate system, align + warp from the gate it was entered
 *   by to the gate it is left by, plus a fixed session-change overhead per jump.
 * - **autopilot**: the same, plus the autopilot's approach: it lands 15 km off
 *   the gate and flies at the hull's base speed to jump range.
 *
 * Only gate legs are timed. A hole, bridge or jump-drive hop adds no time and
 * no warp in the system it lands in, and the result says so (`partial`).
 * Pure: no fetch, no DOM.
 */
import { alignTimeSeconds, inertiaTimeConstantSeconds } from '@/engine/fittings/stats';
import type { RouteStep } from './routeSafetyTrip';

/** `{ systemId: [toSystemId, x, y, z, ...] }`, positions in Mm from the star (`gates.json`). */
export type GatePositions = Readonly<Record<string, readonly number[]>>;

export interface HullFlight {
  massKg: number;
  /** Inertia modifier (dogma `agility`). */
  agility: number;
  /** Base speed in m/s. */
  maxVelocityMs: number;
  /** Warp speed in AU/s. */
  warpSpeedAuPerS: number;
}

export interface TripTime {
  warpToZeroSeconds: number;
  autopilotSeconds: number;
  /** True when a hole, bridge or jump-drive hop was left out of the figures. */
  partial: boolean;
}

export const METRES_PER_AU = 149_597_870_700;
const METRES_PER_MM = 1_000_000;
/** Jump, session change and load, per gate jump (a human decision, issue #6282). */
export const GATE_SESSION_SECONDS = 10;
/** The autopilot lands this far off the gate, and the gate jumps from 2.5 km. */
export const AUTOPILOT_LAND_M = 15_000;
export const GATE_JUMP_RANGE_M = 2_500;
/** Warp starts at 75% of top speed (what align time measures) and ends at 100 m/s. */
const WARP_ENTRY_SPEED_SHARE = 0.75;
const WARP_EXIT_SPEED_MS = 100;

/**
 * Warp time over a distance, from CCP's warp profile: speed grows
 * exponentially from the entry speed at the warp speed rate, cruises at
 * warp speed, then decays to 100 m/s at the lesser of a third of it and 2.
 * A warp too short to reach top speed peaks lower, where accelerating and
 * decelerating meet.
 */
export function warpSeconds(distanceM: number, warpSpeedAuPerS: number, maxVelocityMs: number) {
  if (!(distanceM > 0)) return 0;
  const kAccel = warpSpeedAuPerS;
  const kDecel = Math.min(warpSpeedAuPerS / 3, 2);
  const vMax = warpSpeedAuPerS * METRES_PER_AU;
  const v0 = maxVelocityMs * WARP_ENTRY_SPEED_SHARE;
  const vEnd = WARP_EXIT_SPEED_MS;
  const rampM = (vMax - v0) / kAccel + (vMax - vEnd) / kDecel;
  if (distanceM >= rampM) {
    return (
      Math.log(vMax / v0) / kAccel + Math.log(vMax / vEnd) / kDecel + (distanceM - rampM) / vMax
    );
  }
  const vPeak = Math.max(
    (distanceM + v0 / kAccel + vEnd / kDecel) / (1 / kAccel + 1 / kDecel),
    v0,
    vEnd
  );
  return Math.log(vPeak / v0) / kAccel + Math.log(vPeak / vEnd) / kDecel;
}

/**
 * Seconds to fly `distanceM` from rest at the hull's base speed, accelerating
 * by v(t) = vMax × (1 − e^(−t/τ)), so d(t) = vMax × (t − τ × (1 − e^(−t/τ))).
 */
export function approachSeconds(distanceM: number, hull: HullFlight): number {
  const tau = inertiaTimeConstantSeconds(hull.massKg, hull.agility);
  const distanceAt = (t: number) =>
    hull.maxVelocityMs * (t - (tau === 0 ? 0 : tau * (1 - Math.exp(-t / tau))));
  let lo = 0;
  let hi = distanceM / hull.maxVelocityMs + tau;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid) < distanceM) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** The gate in `systemId` that leads to `toId`, as metres from the star, or `null`. */
function gateMetres(
  gates: GatePositions,
  systemId: number,
  toId: number
): [number, number, number] | null {
  const flat = gates[systemId];
  if (!flat) return null;
  for (let i = 0; i + 3 < flat.length; i += 4) {
    if (flat[i] === toId) {
      return [
        flat[i + 1] * METRES_PER_MM,
        flat[i + 2] * METRES_PER_MM,
        flat[i + 3] * METRES_PER_MM,
      ];
    }
  }
  return null;
}

type Vec = [number, number, number];
const norm = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const apart = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

interface TimedRow {
  systemId: number;
  entry: RouteStep | null;
}

/**
 * The trip's flight time by gate, or `null` when it cannot be known: no gate
 * jump on the route, or a gate position the table lacks (never a zero).
 *
 * Each system between two gate jumps is one warp, entry gate to exit gate. The
 * start system warps to its exit gate and the end system from its entry gate,
 * both from/to the star, the SDE's origin, which stands in for where a pilot
 * starts or ends. A stop in the middle is two warps, in from the entry gate
 * and out to the exit gate, each measured to the star. A system entered or
 * left by a hole, bridge or jump drive has no gate to measure from, so it is
 * left out.
 * @param stopIndexes where along `rows` each stop falls
 */
export function tripTime(
  rows: readonly TimedRow[],
  stopIndexes: readonly number[],
  gates: GatePositions,
  hull: HullFlight
): TripTime | null {
  const stops = new Set(stopIndexes);
  const last = rows.length - 1;
  const byGate = (i: number) => i > 0 && rows[i].entry?.kind === 'gate';
  let jumps = 0;
  let partial = false;
  const warpsM: number[] = [];
  for (let i = 1; i <= last; i++) {
    if (byGate(i)) jumps += 1;
    else partial = true;
  }
  if (jumps === 0) return null;
  for (let i = 0; i <= last; i++) {
    const inGate = byGate(i) ? gateMetres(gates, rows[i].systemId, rows[i - 1].systemId) : null;
    const outGate =
      i < last && byGate(i + 1) ? gateMetres(gates, rows[i].systemId, rows[i + 1].systemId) : null;
    const needsIn = byGate(i);
    const needsOut = i < last && byGate(i + 1);
    if ((needsIn && !inGate) || (needsOut && !outGate)) return null;
    if (i === 0) {
      if (outGate) warpsM.push(norm(outGate));
    } else if (i === last) {
      if (inGate) warpsM.push(norm(inGate));
    } else if (inGate && outGate) {
      if (stops.has(i)) warpsM.push(norm(inGate), norm(outGate));
      else warpsM.push(apart(inGate, outGate));
    }
  }
  const align = alignTimeSeconds(hull.massKg, hull.agility);
  const warpToZeroSeconds =
    warpsM.reduce(
      (sum, m) => sum + align + warpSeconds(m, hull.warpSpeedAuPerS, hull.maxVelocityMs),
      0
    ) +
    jumps * GATE_SESSION_SECONDS;
  const approach = approachSeconds(AUTOPILOT_LAND_M - GATE_JUMP_RANGE_M, hull);
  return { warpToZeroSeconds, autopilotSeconds: warpToZeroSeconds + jumps * approach, partial };
}
