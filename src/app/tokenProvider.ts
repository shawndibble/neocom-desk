import { getValidAccessToken } from '@/auth/session';
import { AuthError } from '@/auth/sso';
import { isAuthFailure } from '@/esi/client';
import { useAuthFailure } from '@/stores/authFailure';

export function isTotalAuthFailure(err: unknown): boolean {
  if (!isAuthFailure(err)) return false;
  if (!(err instanceof AuthError)) return false;
  return err.code === 'invalid_grant';
}

export async function getAccessTokenReportingFailures(characterId: number): Promise<string> {
  try {
    const token = await getValidAccessToken(characterId);
    useAuthFailure.getState().clearFor(characterId, 'token');
    return token;
  } catch (err) {
    if (isTotalAuthFailure(err)) useAuthFailure.getState().reportTokenFailure(characterId);
    throw err;
  }
}
