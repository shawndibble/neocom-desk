import type { RouteSafetyRow } from '@/engine/route/routeSafety';

export function routeSystemName(row: RouteSafetyRow): string {
  return row.name ?? `#${row.systemId}`;
}
