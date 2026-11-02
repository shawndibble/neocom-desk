/**
 * Set waypoints in game (issue #2479): sends a trip's waypoints to the
 * Character's EVE client, one ESI call each, strictly in order. The first call
 * clears the client's own waypoints; the rest add after it.
 *
 * Which waypoints, and where a wormhole or bridge cuts them off, is
 * `engine/route/waypoints.ts`'s job — this only sends them.
 */
import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { postAutopilotWaypoint } from '@/esi/endpoints';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';

export type SetWaypointsResult =
  | { ok: true; set: number }
  | {
      ok: false;
      /** How many waypoints the client took before the failure. */
      set: number;
      /** ESI's own words, or `null` when it gave none. */
      message: string | null;
      /** ESI refused and the grant lacks the waypoint scope: a Grant fixes it. */
      needsPermission?: true;
      /** The request never reached ESI (offline, a timeout): nothing was refused. */
      offline?: true;
      /** The failure was a timeout after the request left: that waypoint may have been set. */
      unconfirmed?: true;
    };

function messageOf(err: unknown): string | null {
  return err instanceof EsiError && err.message !== '' ? err.message : null;
}

export async function setWaypointsInGame(
  characterId: number,
  waypoints: readonly number[],
  { clearOthers = true }: { clearOthers?: boolean } = {}
): Promise<SetWaypointsResult> {
  for (const [index, destinationId] of waypoints.entries()) {
    try {
      await postAutopilotWaypoint(characterId, destinationId, {
        clearOtherWaypoints: clearOthers && index === 0,
      });
    } catch (err) {
      if (isOfflineFailure(err)) {
        return isUnconfirmedWrite(err)
          ? { ok: false, set: index, message: null, offline: true, unconfirmed: true }
          : { ok: false, set: index, message: null, offline: true };
      }
      const outcome = await reportWriteAuthFailure(characterId, err, 'postAutopilotWaypoint');
      return outcome === 'grant-needed'
        ? { ok: false, set: index, message: messageOf(err), needsPermission: true }
        : { ok: false, set: index, message: messageOf(err) };
    }
  }
  return { ok: true, set: waypoints.length };
}
