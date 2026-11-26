import { alignTimeSeconds, inertiaTimeConstantSeconds } from '@/engine/fittings/stats';
import type { RouteStep } from './routeSafetyTrip';

export type GatePositions = Readonly<Record<string, readonly number[]>>;

export interface HullFlight {
  massKg: number;
  agility: number;
  maxVelocityMs: number;
  warpSpeedAuPerS: number;
}

export interface TripTime {
  warpToZeroSeconds: number;
  autopilotSeconds: number;
  partial: boolean;
}

export const METRES_PER_AU = 149_597_870_700;
const METRES_PER_MM = 1_000_000;
export const GATE_SESSION_SECONDS = 10;
export const AUTOPILOT_LAND_M = 15_000;
export const GATE_JUMP_RANGE_M = 2_500;
const WARP_ENTRY_SPEED_SHARE = 0.75;
const WARP_EXIT_SPEED_MS = 100;

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
