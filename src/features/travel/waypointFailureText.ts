/**
 * The wording for a waypoint send that did not finish (issue #2479, #4985):
 * offline, timed out, or ESI refused, with how many of `total` the client took.
 * Shared by Route Safety's button and the haul's, so the two cannot drift.
 */
import type { TFunction } from 'i18next';
import type { SetWaypointsResult } from './sendWaypoints';

/** The message, or `null` when ESI refused for a missing grant: the caller shows the Grant link instead. */
export function waypointFailureText(
  t: TFunction,
  result: Extract<SetWaypointsResult, { ok: false }>,
  total: number
): string | null {
  const { set } = result;
  if (result.offline) {
    return result.unconfirmed
      ? set === 0
        ? t('travel.waypoints.unconfirmed')
        : t('travel.waypoints.unconfirmedPartway', { set, total })
      : set === 0
        ? t('travel.waypoints.offline')
        : t('travel.waypoints.offlinePartway', { set, total });
  }
  if (result.needsPermission) return null;
  const message = result.message ?? t('travel.waypoints.unknownError');
  return set === 0
    ? t('travel.waypoints.failed', { message })
    : t('travel.waypoints.failedPartway', { set, total, message });
}
