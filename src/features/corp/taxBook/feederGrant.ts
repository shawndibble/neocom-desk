import { completeFeederGrantLogin } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';

export interface FeederGrantCallbackState {
  feederGrant: FeederGrantOutcome | { status: 'cancelled' };
}

export type FeederGrantOutcome =
  | { status: 'on'; name: string }
  | {
      status: 'failed';
      reason?: string;
    };

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
