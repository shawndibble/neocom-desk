import type { RouteSafetyRow } from '@/engine/route/routeSafety';

/** A system the snapshot cannot name still needs one to show and act on. */
export function routeSystemName(row: RouteSafetyRow): string {
  return row.name ?? `#${row.systemId}`;
}
