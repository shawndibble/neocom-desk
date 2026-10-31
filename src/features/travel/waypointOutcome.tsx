/**
 * What a finished `setWaypointsInGame` call says, as one sentence or a Grant
 * link: shared by the order book's button and row menus (`useSetDestination`)
 * and the Command Palette's Shift+Enter, so the wording cannot drift.
 */
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { permissionsForEndpoints, type EsiEndpointId, type ScopeGroup } from '@/esi/registry';
import type { SetWaypointsResult } from './sendWaypoints';

/** The endpoint a waypoint write needs, and the Permissions that cover it. */
export const WAYPOINT_ENDPOINTS: readonly EsiEndpointId[] = ['postAutopilotWaypoint'];
export const WAYPOINT_GROUPS: readonly ScopeGroup[] = permissionsForEndpoints(WAYPOINT_ENDPOINTS);

export interface WaypointOutcome {
  tone: 'status' | 'alert';
  text: ReactNode;
}

export function waypointOutcome(
  result: SetWaypointsResult,
  placeName: string,
  t: TFunction,
  /** The place was queued as the next stop, not made the destination. */
  added = false
): WaypointOutcome {
  if (result.ok) {
    return {
      tone: 'status',
      text: t(added ? 'travel.waypoints.nextStopAdded' : 'market.orderDetail.destinationSet', {
        placeName,
      }),
    };
  }
  if (result.offline) {
    return {
      tone: 'alert',
      text: result.unconfirmed ? t('travel.waypoints.unconfirmed') : t('travel.waypoints.offline'),
    };
  }
  return {
    tone: 'alert',
    text: result.needsPermission ? (
      <GrantMissingLink groups={WAYPOINT_GROUPS} />
    ) : (
      t('travel.waypoints.failed', {
        message: result.message ?? t('travel.waypoints.unknownError'),
      })
    ),
  };
}
