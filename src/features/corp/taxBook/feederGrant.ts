/**
 * A moon owner's grant, client side (ADR 0025 amendment): a separate SSO round
 * trip where the player picks the Accountant Character on EVE's login screen, so
 * the Character need not be on their account and any Character may authorise.
 * Its refresh token goes to the server and never into a device session.
 */
import { completeFeederGrantLogin } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';

/** What the grant round trip hands back, as router state, to the Moons page. */
export interface FeederGrantCallbackState {
  feederGrant: FeederGrantOutcome | { status: 'cancelled' };
}

export type FeederGrantOutcome =
  | { status: 'on'; name: string }
  | {
      status: 'failed';
      /** The server's reason (`not-an-accountant`, `invite-used`, …) when it gave one. */
      reason?: string;
    };

/** Finish the round trip: the tokens live only in this call's locals. */
export async function completeFeederGrant(params: {
  code: string;
  state: string;
}): Promise<FeederGrantOutcome> {
  const result = await completeFeederGrantLogin(params);
  try {
    const { saveFeederGrantRemote } = await import('@/sync/corpSyncGrantApi');
    await saveFeederGrantRemote(result.expectedCharacterId, {
      code: result.inviteCode,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      ...(result.requestedRatePct === undefined
        ? {}
        : { requestedRatePct: result.requestedRatePct }),
    });
  } catch (error) {
    reportFailure('auth', error);
    return { status: 'failed', reason: callableErrorReason(error) ?? undefined };
  }
  return { status: 'on', name: result.name };
}
