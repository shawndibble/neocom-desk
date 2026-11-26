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
