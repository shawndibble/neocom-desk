// Session-only record of the most recent EVE auth failure, so the shell reacts
// once, centrally, instead of nine views each rediscovering it: `esi/cache.ts`
// already computes `needsReauth` on every read-through call and only lacked a
// sink.
//
// Deliberately NOT persisted (mirrors `publicInfo.ts`). A reload clears it, as
// do `dismiss()` and a character switch — which is what keeps a re-auth prompt
// from pinning on forever for a failure re-authing cannot fix.
import { create } from 'zustand';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';

/**
 * - `token`: the refresh grant failed before any request. Nothing in the app
 *   can work, so the shell redirects to /login.
 * - `request`: one ESI read answered 401/403. Other views may be fine, so the
 *   shell only notes it.
 */
export type AuthFailureKind = 'token' | 'request';

export interface AuthFailure {
  characterId: number;
  kind: AuthFailureKind;
}

interface AuthFailureState {
  failure: AuthFailure | null;
  reportTokenFailure: (characterId: number) => void;
  reportRequestFailure: (characterId: number) => void;
  dismiss: () => void;
  /**
   * Drop a stale failure — on character switch, or once the grant works again.
   * `kind` narrows what counts as stale: a fresh access token proves the
   * refresh grant is alive but says nothing about a scope a previous read was
   * refused for, so it must not clear a `'request'` failure.
   */
  clearFor: (characterId: number, kind?: AuthFailureKind) => void;
}

/** `token` outranks `request`: a dead refresh token makes every read moot. */
function outranks(next: AuthFailureKind, current: AuthFailure | null): boolean {
  return current === null || next === 'token' || current.kind === 'request';
}

export const useAuthFailure = create<AuthFailureState>((set, get) => ({
  failure: null,
  reportTokenFailure: (characterId) => {
    set({ failure: { characterId, kind: 'token' } });
  },
  reportRequestFailure: (characterId) => {
    if (!outranks('request', get().failure)) return;
    set({ failure: { characterId, kind: 'request' } });
  },
  dismiss: () => {
    set({ failure: null });
  },
  clearFor: (characterId, kind) => {
    const { failure } = get();
    if (!failure || failure.characterId !== characterId) return;
    if (kind !== undefined && failure.kind !== kind) return;
    set({ failure: null });
  },
}));

/**
 * Subscribe the store to `esi`'s auth-failure signal; returns an unsubscribe.
 * Wired here, once from the shell, so `esi` need not know this store exists.
 */
export function subscribeToEsiAuthFailures(): () => void {
  return onEsiAuthFailure((characterId) => {
    useAuthFailure.getState().reportRequestFailure(characterId);
  });
}

/** Direct publish, for tests and non-React callers that already hold a store. */
export function reportEsiAuthFailure(characterId: number): void {
  useAuthFailure.getState().reportRequestFailure(characterId);
}
