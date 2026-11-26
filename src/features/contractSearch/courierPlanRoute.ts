import type { CourierEndpoint } from '@/engine/contracts/courierSearch';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { routeStopsHref } from '@/features/route/routeSafetyLink';
import type { StopRef } from '@/engine/route/stopRef';

function stopOf(end: CourierEndpoint, systemId: number): StopRef {
  return { systemId, stationId: end.resolution === 'unknown' ? null : end.locationId };
}

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
