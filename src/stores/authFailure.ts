// Session-only record of the most recent EVE auth failure, so the shell can
// react once, centrally, instead of nine views each rediscovering it.
//
// Why a store and not a per-view flag: `esi/cache.ts` already computes
// `needsReauth` on every read-through call — the signal exists, it just has no
// sink. One sink here means a stale grant (revoked in EVE's third-party
// application portal, so the locally stored `TokenRecord.scopes` still claims
// it) surfaces even though the pre-fetch scope gate in `app/routeScopes.ts`
// saw nothing wrong.
//
// Deliberately NOT persisted (mirrors `publicInfo.ts`): a reload clears it.
// That, plus `dismiss()` and clearing on character switch, is what keeps a
// re-auth prompt from pinning on forever for a failure re-authing cannot fix
// — notably ESI's 403 for a structure a character isn't on the ACL of, which
// `esi/client.isAuthFailure` currently cannot tell apart from a missing scope.
import { create } from 'zustand';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';

/**
 * - `token`: the refresh grant itself failed, before any ESI request. Nothing
 *   in the app can work — the shell redirects to /login.
 * - `request`: a single ESI read answered 401/403. Other views may be fine, so
 *   the shell only notes it.
 */
export type AuthFailureKind = 'token' | 'request';

export interface AuthFailure {
  characterId: number;
  kind: AuthFailureKind;
}

interface AuthFailureState {
  failure: AuthFailure | null;
  /** Refresh grant rejected: total failure, the shell sends the user to /login. */
  reportTokenFailure: (characterId: number) => void;
  /** One ESI read came back 401/403: the shell shows a re-auth note. */
  reportRequestFailure: (characterId: number) => void;
  /** User acknowledged the note. */
  dismiss: () => void;
  /**
   * Drop a stale failure — on character switch, or once the grant works again.
   * `kind` narrows what counts as stale: a fresh access token proves the
   * refresh grant is alive (`'token'`) but says nothing about a scope a
   * previous read was refused for, so it must not clear a `'request'` failure.
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
 * Subscribe the store to `esi`'s auth-failure signal. Called once from the
 * shell: `esi` publishes and must not know this store exists, so the wiring
 * lives here rather than as an import inside `esi/cache.ts`.
 *
 * Returns an unsubscribe.
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
