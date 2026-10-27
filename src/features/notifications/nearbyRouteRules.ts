/**
 * This device's Travel Settings for the `registerDevice` upload (issue #5122,
 * ADR 0028), so the server counts nearby jumps as Route Safety does
 * (`loadJumpBasis`'s rules, without the wormhole and bridge shortcuts). Read
 * only when some Character wants a nearby push: the read can fetch the
 * pod-kill list. `null` sends none, keeping what the server stored; so does a
 * failed read. Lazy, like Firebase: the startup bundle reaches this module.
 */
import type { RouteRules } from '@/features/route/routeRules';
import { isNearbyServerEvent, type ServerEventRegistration } from './serverEvents';

export async function routeRulesForServer(
  registrations: ReadonlyMap<number, ServerEventRegistration>
): Promise<RouteRules | null> {
  const wanted = [...registrations.values()].some((r) => r.serverEvents.some(isNearbyServerEvent));
  if (!wanted) return null;
  try {
    const { loadRouteRules } = await import('@/features/route/routeRules');
    return await loadRouteRules();
  } catch {
    return null;
  }
}
