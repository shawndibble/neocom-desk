/**
 * Connect one of the player's own CEO corporations as a moon owner of their
 * book, client side: a separate SSO round trip signed in as that corporation's
 * CEO, whose grant goes to the server and never into a device session or Dexie.
 * The wrong-character check is made here, before anything leaves the device.
 */
import { completeOwnCorpGrantLogin } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';

export type OwnCorpGrantOutcome =
  | { status: 'connected'; corporationId: number }
  | { status: 'wrong-character'; corporationId: number; signedInAs: string }
  | { status: 'refused'; corporationId: number; reason: string }
  | { status: 'cancelled'; corporationId: number };

/** What the round trip hands back, as router state, to the Moons page. */
export interface OwnCorpGrantCallbackState {
  ownCorpGrant: OwnCorpGrantOutcome;
}

/** Finish the round trip: the tokens live only in this call's locals. */
export async function completeOwnCorpGrant(params: {
  code: string;
  state: string;
}): Promise<OwnCorpGrantOutcome> {
  const result = await completeOwnCorpGrantLogin(params);
  const corporationId = result.feederCorporationId;
  if (result.characterId !== result.expectedCeoCharacterId) {
    return {
      status: 'wrong-character',
      corporationId,
      signedInAs: result.name || String(result.characterId),
    };
  }
  try {
    const { addOwnCorpFeederRemote } = await import('@/sync/corpSyncGrantApi');
    const outcome = await addOwnCorpFeederRemote({
      editorCharacterId: result.expectedCharacterId,
      collectorCorporationId: result.collectorCorporationId,
      feederCorporationId: corporationId,
      grantAccessToken: result.accessToken,
      grantRefreshToken: result.refreshToken,
      ...(result.coverageFrom === undefined ? {} : { coverageFrom: result.coverageFrom }),
    });
    return outcome.ok
      ? { status: 'connected', corporationId }
      : { status: 'refused', corporationId, reason: outcome.reason };
  } catch (error) {
    reportFailure('auth', error);
    return { status: 'refused', corporationId, reason: callableErrorReason(error) ?? 'unknown' };
  }
}
