import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthError } from '@/auth/sso';
import { EsiError } from '@/esi/client';
import { useAuthFailure } from '@/stores/authFailure';
import { getAccessTokenReportingFailures, isTotalAuthFailure } from './tokenProvider';

// Vitest cannot spy on a live ES module binding; replace the one function the
// provider wraps.
const { getValidAccessToken } = vi.hoisted(() => ({ getValidAccessToken: vi.fn() }));
vi.mock('@/auth/session', () => ({ getValidAccessToken }));

const CHARACTER_ID = 7;

beforeEach(() => {
  useAuthFailure.setState({ failure: null });
  getValidAccessToken.mockReset();
});

describe('isTotalAuthFailure', () => {
  it('accepts a revoked refresh grant', () => {
    expect(isTotalAuthFailure(new AuthError('invalid_grant', 'revoked', 400))).toBe(true);
  });

  it('rejects a transient SSO outage, which must not log the user out', () => {
    expect(isTotalAuthFailure(new AuthError('unknown_error', 'gateway', 503))).toBe(false);
  });

  it('rejects an offline/network error', () => {
    expect(isTotalAuthFailure(new TypeError('Failed to fetch'))).toBe(false);
    expect(isTotalAuthFailure(new AuthError('network_error', 'offline', 0))).toBe(false);
  });

  it('rejects an ESI 403, which can mean a structure ACL rather than a bad grant', () => {
    // Unreachable through the token provider by construction; asserted so the
    // narrowing survives anyone widening it later.
    expect(isTotalAuthFailure(new EsiError(403, 'Forbidden'))).toBe(false);
  });
});

describe('getAccessTokenReportingFailures', () => {
  it('returns the token and clears a stale token failure', async () => {
    useAuthFailure.getState().reportTokenFailure(CHARACTER_ID);
    getValidAccessToken.mockResolvedValue('fresh-token');

    await expect(getAccessTokenReportingFailures(CHARACTER_ID)).resolves.toBe('fresh-token');
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('leaves a request-level failure alone: a fresh token does not restore a missing scope', async () => {
    useAuthFailure.getState().reportRequestFailure(CHARACTER_ID);
    getValidAccessToken.mockResolvedValue('fresh-token');

    await getAccessTokenReportingFailures(CHARACTER_ID);
    expect(useAuthFailure.getState().failure).toEqual({
      characterId: CHARACTER_ID,
      kind: 'request',
    });
  });

  it('reports a total failure and rethrows when the grant is revoked', async () => {
    const err = new AuthError('invalid_grant', 'revoked', 400);
    getValidAccessToken.mockRejectedValue(err);

    await expect(getAccessTokenReportingFailures(CHARACTER_ID)).rejects.toBe(err);
    expect(useAuthFailure.getState().failure).toEqual({ characterId: CHARACTER_ID, kind: 'token' });
  });

  it('does NOT report — so does not redirect — when the failure is just offline', async () => {
    const err = new TypeError('Failed to fetch');
    getValidAccessToken.mockRejectedValue(err);

    await expect(getAccessTokenReportingFailures(CHARACTER_ID)).rejects.toBe(err);
    expect(useAuthFailure.getState().failure).toBeNull();
  });
});
