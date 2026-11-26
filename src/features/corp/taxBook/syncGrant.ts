import { completeCorpSyncLogin, getValidAccessToken } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { reportFailure } from '@/observability/reportFailure';

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
      reason?: string;
    };

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
