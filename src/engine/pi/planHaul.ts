/**
 * Hauling and upkeep for the Plan tab: how much a pilot moves per trip, which
 * ship holds it, and how exposed the route to the sell market is.
 *
 * ## The ship classes are approximate, and say so
 *
 * A hold depends on skills, rigs and fittings, so these are round figures a
 * pilot can recognise, not a fit calculation. They are the same three the
 * mockup (`docs/design/pi-tabs/plan.html`, `SHIPS`) draws, and the only place
 * the thresholds live:
 *
 * - **Frigate cargo**: about 400 m3, what any frigate carries;
 * - **Industrial**: about 5,000 m3, a trained industrial with a cargo expander;
 * - **Epithal**: about 45,000 m3, its planetary commodities bay.
 *
 * ## Unknown is not zero
 *
 * A colony with no measurable output has no m3, and a route nobody resolved has
 * no jump count. Both come back `null`, never `0`: a "0 lowsec jumps" the app
 * never measured would read as a safe route.
 *
 * Pure: loads, routes and cadences are parameters. The route systems are
 * resolved by the caller from the local stargate graph; nothing here routes.
 */

import { securityBand } from '@/engine/securityStatus';

export type ShipClass = 'frigate' | 'industrial' | 'epithal';

export const HAUL_SHIPS: readonly { id: ShipClass; label: string; m3: number }[] = [
  { id: 'frigate', label: 'Frigate cargo', m3: 400 },
  { id: 'industrial', label: 'Industrial hauler', m3: 5_000 },
  { id: 'epithal', label: 'Epithal planetary bay', m3: 45_000 },
];

export interface HaulFit {
  fits: Record<ShipClass, boolean>;
  /** The smallest ship that holds the whole trip; null when none does. */
  smallest: ShipClass | null;
  /** Industrial trips the load would take; 1 when it fits one. */
  industrialTrips: number;
}

/** Which ships hold a trip of `m3`. Null when the load is unknown. */
export function haulFit(m3: number | null): HaulFit | null {
  if (m3 === null || !Number.isFinite(m3) || m3 < 0) return null;
  const fits = Object.fromEntries(HAUL_SHIPS.map((ship) => [ship.id, m3 <= ship.m3])) as Record<
    ShipClass,
    boolean
  >;
  return {
    fits,
    smallest: HAUL_SHIPS.find((ship) => m3 <= ship.m3)?.id ?? null,
    industrialTrips: Math.max(
      1,
      Math.ceil(m3 / (HAUL_SHIPS.find((ship) => ship.id === 'industrial')?.m3 ?? 5_000))
    ),
  };
}

export interface RouteSystem {
  systemId: number;
  /** Null where the system's security did not resolve. */
  security: number | null;
}

export interface RouteExposure {
  jumps: number;
  /** Null when any system flown into has no known security. */
  lowsec: number | null;
  nullsec: number | null;
}

/**
 * Jumps and low/null-sec jumps along a route, origin first.
 *
 * A jump is counted by the system it **enters**, so the origin is never in the
 * count: a pilot who lives in lowsec has not jumped into it. (That differs from
 * `summarizeRouteSafety`, which counts the systems on the route, origin
 * included.) Null when the route could not be resolved.
 */
export function routeExposure(route: readonly RouteSystem[] | null): RouteExposure | null {
  if (route === null) return null;
  const entered = route.slice(1);
  const known = entered.every((system) => system.security !== null);
  const count = (band: 'lowsec' | 'nullsec') =>
    known
      ? entered.filter((system) => securityBand(system.security as number) === band).length
      : null;
  return { jumps: entered.length, lowsec: count('lowsec'), nullsec: count('nullsec') };
}

export interface HaulColony {
  planetId: number;
  /** m3 the colony ships a day after the plan; null when it cannot be measured. */
  m3PerDay: number | null;
  /** The same, as the colony runs today. */
  todayM3PerDay: number | null;
  /** Systems to the sell market, origin first; `'local'` for a corp buyback collected at home; null when unresolved. */
  route: readonly RouteSystem[] | 'local' | null;
}

export type HaulRoute =
  | { kind: 'local' }
  | { kind: 'unknown' }
  | {
      kind: 'route';
      farthestPlanetId: number;
      jumps: number;
      lowsec: number | null;
      nullsec: number | null;
    };

export interface HaulSummary {
  haulDays: number;
  restartDays: number;
  tripsPerWeek: number;
  /** Null when no colony could be measured. */
  m3PerTrip: number | null;
  todayM3PerTrip: number | null;
  /** False when a colony is left out of the sums for want of a figure. */
  complete: boolean;
  fit: HaulFit | null;
  route: HaulRoute;
}

function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
}

export function haulSummary(input: {
  haulDays: number;
  restartDays: number;
  colonies: readonly HaulColony[];
}): HaulSummary {
  const { haulDays, restartDays, colonies } = input;
  const perTrip = (perDay: number | null) => (perDay === null ? null : perDay * haulDays);
  const m3PerDay = sumKnown(colonies.map((colony) => colony.m3PerDay));
  const todayM3PerDay = sumKnown(colonies.map((colony) => colony.todayM3PerDay));
  const m3PerTrip = perTrip(m3PerDay);

  let route: HaulRoute;
  if (colonies.length === 0 || colonies.every((colony) => colony.route === 'local')) {
    route = { kind: 'local' };
  } else if (colonies.some((colony) => colony.route === null)) {
    route = { kind: 'unknown' };
  } else {
    let farthest: { planetId: number; exposure: RouteExposure } | null = null;
    for (const colony of colonies) {
      if (colony.route === 'local' || colony.route === null) continue;
      const exposure = routeExposure(colony.route);
      if (exposure && (!farthest || exposure.jumps > farthest.exposure.jumps)) {
        farthest = { planetId: colony.planetId, exposure };
      }
    }
    route = farthest
      ? { kind: 'route', farthestPlanetId: farthest.planetId, ...farthest.exposure }
      : { kind: 'unknown' };
  }

  return {
    haulDays,
    restartDays,
    tripsPerWeek: 7 / haulDays,
    m3PerTrip,
    todayM3PerTrip: perTrip(todayM3PerDay),
    complete: colonies.every((colony) => colony.m3PerDay !== null),
    fit: haulFit(m3PerTrip),
    route,
  };
}
