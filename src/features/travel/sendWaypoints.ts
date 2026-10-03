/**
 * Set waypoints in game (issue #2479): sends a trip's waypoints to the
 * Character's EVE client, one ESI call each, strictly in order. The first call
 * clears the client's own waypoints; the rest add after it.
 *
 * Which waypoints, and where a wormhole or bridge cuts them off, is
 * `engine/route/waypoints.ts`'s job — this only sends them.
 */
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
    };

function messageOf(err: unknown): string | null {
  return err instanceof EsiError && err.message !== '' ? err.message : null;
}

export async function setWaypointsInGame(
  characterId: number,
  waypoints: readonly number[]
): Promise<SetWaypointsResult> {
  for (const [index, destinationId] of waypoints.entries()) {
    try {
      await postAutopilotWaypoint(characterId, destinationId, {
        clearOtherWaypoints: index === 0,
      });
    } catch (err) {
      const outcome = await reportWriteAuthFailure(characterId, err, 'postAutopilotWaypoint');
      return outcome === 'grant-needed'
        ? { ok: false, set: index, message: messageOf(err), needsPermission: true }
        : { ok: false, set: index, message: messageOf(err) };
    }
  }
  return { ok: true, set: waypoints.length };
}
