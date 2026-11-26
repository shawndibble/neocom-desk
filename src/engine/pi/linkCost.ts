import type { PiLinkSpec } from '@/sde/types';
import type { PinLoad } from './types';

export interface SurfacePoint {
  latitude: number;
  longitude: number;
}

export interface LinkGeometry {
  a: SurfacePoint;
  b: SurfacePoint;
  level: number;
}

export function greatCircleKm(a: SurfacePoint, b: SurfacePoint, radiusKm: number): number {
  const cosine =
    Math.cos(a.latitude) * Math.cos(b.latitude) +
    Math.sin(a.latitude) * Math.sin(b.latitude) * Math.cos(a.longitude - b.longitude);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * radiusKm;
}

export function linksLoad(
  links: readonly LinkGeometry[],
  radiusKm: number,
  spec: PiLinkSpec
): PinLoad {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new Error(`A link's cost needs a positive planet radius; got ${radiusKm}`);
  }

  let cpu = 0;
  let powergrid = 0;
  for (const link of links) {
    const km = greatCircleKm(link.a, link.b, radiusKm);
    const level = Math.max(0, Math.trunc(link.level));
    cpu += (spec.cpu + spec.cpuPerKm * km) * spec.cpuLevelModifier ** level;
    powergrid += (spec.powergrid + spec.powergridPerKm * km) * spec.powergridLevelModifier ** level;
  }
  return { cpu, powergrid };
}

export function newLinkLoad(
  links: readonly LinkGeometry[],
  radiusKm: number,
  spec: PiLinkSpec
): PinLoad | null {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || links.length === 0) return null;

  let longestKm = 0;
  for (const link of links) {
    longestKm = Math.max(longestKm, greatCircleKm(link.a, link.b, radiusKm));
  }
  return {
    cpu: spec.cpu + spec.cpuPerKm * longestKm,
    powergrid: spec.powergrid + spec.powergridPerKm * longestKm,
  };
}
