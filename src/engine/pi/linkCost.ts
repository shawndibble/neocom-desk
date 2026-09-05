/**
 * What a colony's links draw (issue #440).
 *
 * A link is a pin cost like any other, with one difference that made it easy
 * to miss: its size depends on the **distance between the two pins it joins**,
 * so unlike every other pin it cannot be priced from a lookup table. The
 * Advisor shipped without charging for links at all, which understated every
 * linked colony's load and overstated its headroom.
 *
 * ## Why per-planet radius is not optional
 *
 * ESI gives each pin a latitude and longitude in radians; turning that into
 * kilometres needs the planet's own radius, and planets vary enormously (121
 * km to 159,270 km across New Eden). The effect is not a rounding error: one
 * reported pilot's two colonies have near-identical layouts, and the links
 * cost 255 MW on a 6,030 km planet against 1,708 MW on an 85,400 km one. A
 * constant would not be imprecise, it would be wrong.
 *
 * Radius is not in ESI and not derivable from the planet *type* — every planet
 * type reports a placeholder `radius` of 10000 — so it ships as its own SDE
 * payload, `pi-planet-radius.json`.
 *
 * ## Latitude here is a polar angle
 *
 * ESI's pin latitudes run 0..pi and cluster around pi/2, so they are
 * colatitude measured from a pole, not a signed latitude measured from the
 * equator. Reading them the usual way would put an equatorial pin near a pole
 * and shrink every distance.
 *
 * ## What is verified, and what is not
 *
 * The base costs and per-km terms are the Link type's own dogma attributes
 * (2280: `cpuLoad` 15, `powerLoad` 10, `cpuLoadPerKm` 0.2, `powerLoadPerKm`
 * 0.15), and the resulting totals were checked against two real colonies:
 * both land inside their Command Center's budget, and the larger planet's
 * links account for the headroom its owner reports having lost.
 *
 * The **level modifiers are applied as a power of the link level**, which is
 * the natural reading of `cpuLoadLevelModifier` / `powerLoadLevelModifier` but
 * is *not* verified — every link in the data checked was level 0, where any
 * reading agrees. If upgraded links ever look wrong, this is the assumption to
 * challenge first.
 */

import type { PiLinkSpec } from '@/sde/types';
import type { PinLoad } from './types';

/** A point on a planet's surface, in ESI's own radian convention. */
export interface SurfacePoint {
  /** Polar angle from a pole, 0..pi — not a signed latitude. */
  latitude: number;
  longitude: number;
}

export interface LinkGeometry {
  a: SurfacePoint;
  b: SurfacePoint;
  /** ESI's `link_level`. 0 is an un-upgraded link. */
  level: number;
}

/**
 * Great-circle surface distance between two pins, in km.
 *
 * The cosine is clamped before `acos`: two pins at the same spot produce a
 * dot product a hair above 1 in floating point, and `Math.acos(1.0000000002)`
 * is NaN — which would silently poison a colony's whole load.
 */
export function greatCircleKm(a: SurfacePoint, b: SurfacePoint, radiusKm: number): number {
  const cosine =
    Math.cos(a.latitude) * Math.cos(b.latitude) +
    Math.sin(a.latitude) * Math.sin(b.latitude) * Math.cos(a.longitude - b.longitude);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * radiusKm;
}

/**
 * Total CPU and Powergrid drawn by a colony's links.
 *
 * Throws on a radius that cannot be used. That is deliberate: returning zero
 * for an unresolved planet would restore exactly the bug this module fixes,
 * and it would do it silently, on the one surface whose promise is that it
 * never states a number it cannot stand behind. A caller without a radius must
 * say so rather than pass a placeholder — see `colonyPinLoad`, which keeps the
 * link cost `null` in that case.
 */
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
