import type { CourierEndpoint } from '@/engine/contracts/courierSearch';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { routeStopsHref } from '@/features/route/routeSafetyLink';
import type { StopRef } from '@/engine/route/stopRef';

function stopOf(end: CourierEndpoint, systemId: number): StopRef {
  return { systemId, stationId: end.resolution === 'unknown' ? null : end.locationId };
}

/**
 * Route Safety from the contract's pickup to its drop-off, opened the way the
 * board measured the jumps. `null` when either end has no solar system: half a
 * trip would mislead. Route Safety keeps each system once, so a haul inside one
 * system links a single stop.
 */
export function courierPlanRouteHref(
  origin: CourierEndpoint,
  destination: CourierEndpoint,
  preference: RoutePreferenceKind
): string | null {
  if (origin.systemId === null || destination.systemId === null) return null;
  const stops = [stopOf(origin, origin.systemId)];
  if (destination.systemId !== origin.systemId) {
    stops.push(stopOf(destination, destination.systemId));
  }
  return routeStopsHref(null, stops, preference);
}
