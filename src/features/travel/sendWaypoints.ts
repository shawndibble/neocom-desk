import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { postAutopilotWaypoint } from '@/esi/endpoints';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';

export type SetWaypointsResult =
  | { ok: true; set: number }
  | {
      ok: false;
      set: number;
      message: string | null;
      needsPermission?: true;
      offline?: true;
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
