/**
 * Corp Tax Book sync grant, client side (ADR 0025): the "Automatic sync" opt-in
 * in the book's settings. A separate SSO authorization whose refresh token goes
 * to the server and **never** to this device, modelled on the Alerts Grant
 * (`features/notifications/alertsGrant.ts`). Unlike that one it keeps no local
 * record: the book's `meta/scheduledSync` says who holds it and whether it runs.
 */
import { completeCorpSyncLogin, getValidAccessToken } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';

/** What a sync grant round trip hands back, as router state, to the page it was pressed on. */
export interface CorpSyncCallbackState {
  corpSyncGrant: CorpSyncGrantOutcome | { status: 'cancelled' };
}

export type CorpSyncGrantOutcome =
  | { status: 'on'; characterId: number; name: string }
  | {
      status: 'mismatch';
      expectedCharacterId: number;
      authorizedCharacterId: number;
      authorizedName: string;
    }
  | {
      status: 'failed';
      characterId: number;
      /** The server's reason (`not-an-editor`, `wrong-corp`, `no-book`, …) when it gave one. */
      reason?: string;
    };

/**
 * Finish a sync grant round trip. A match hands the refresh token to the server;
 * a mismatch stores and sends nothing, because the token belongs to a Character
 * the user did not press. The tokens live only in this call's locals.
 */
export async function completeCorpSyncGrant(params: {
  code: string;
  state: string;
}): Promise<CorpSyncGrantOutcome> {
  const result = await completeCorpSyncLogin(params);
  if (result.characterId !== result.expectedCharacterId) {
    return {
      status: 'mismatch',
      expectedCharacterId: result.expectedCharacterId,
      authorizedCharacterId: result.characterId,
      authorizedName: result.name,
    };
  }
  try {
    const { saveCorpSyncGrantRemote } = await import('@/sync/corpSyncGrantApi');
    await saveCorpSyncGrantRemote(result.characterId, {
      corporationId: result.corporationId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    reportFailure('auth', error);
    return {
      status: 'failed',
      characterId: result.characterId,
      reason: callableErrorReason(error) ?? undefined,
    };
  }
  return { status: 'on', characterId: result.characterId, name: result.name };
}

/**
 * Turn the schedule off: the holder revokes their own grant, or the CEO revokes
 * anyone's. The CEO's call carries a fresh access token so the server can check
 * the role live. Resolves false (and reports) when the server could not do it.
 */
export async function turnOffScheduledSync(args: {
  characterId: number;
  corporationId: number;
  asCeo: boolean;
}): Promise<boolean> {
  try {
    const { revokeCorpSyncGrantRemote } = await import('@/sync/corpSyncGrantApi');
    await revokeCorpSyncGrantRemote(args.characterId, {
      corporationId: args.corporationId,
      ...(args.asCeo ? { accessToken: await getValidAccessToken(args.characterId) } : {}),
    });
    return true;
  } catch (error) {
    reportFailure('auth', error);
    return false;
  }
}
