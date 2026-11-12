// Session-only record of the most recent EVE auth failure, so the shell reacts
// once, centrally, instead of nine views each rediscovering it: `esi/cache.ts`
// already computes `needsReauth` on every read-through call and only lacked a
// sink.
//
// `failure` is deliberately NOT persisted (mirrors `publicInfo.ts`). A reload
// clears it, as do `dismiss()` and a character switch — which is what keeps a
// re-auth prompt from pinning on forever for a failure re-authing cannot fix.
// The needs-login mark below is the exception, and persists: a dead grant
// stays dead across a reload until that Character logs in again.
import { create } from 'zustand';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { onDeadGrant } from '@/auth/deadGrantSignal';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import type { EsiEndpointId } from '@/esi/registry';

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
  /** For a `request` failure, the endpoint refused — when the reporter knew it. */
  endpointId?: EsiEndpointId;
}

/**
 * Characters whose refresh grant EVE refused, any Character, not only the
 * active one (issue #6091). Device-local in Dexie `settings`, never synced:
 * it describes this device's tokens, which never leave it. Set by every
 * `'token'` failure, cleared when that Character's grant works again
 * (`clearFor`) or it is removed. Characters shows it on the row, and the
 * `characterNeedsLogin` Notification Event alerts on it once.
 */
export const useNeedsLogin = createLocalSetting<readonly number[]>({
  key: 'auth.needsLogin',
  defaultValue: [],
  parse: (raw) =>
    Array.isArray(raw) && raw.every((id) => Number.isInteger(id)) ? (raw as number[]) : null,
});

/**
 * Every mark and clear, one after another. Each hydrates first (a write before
 * the stored list is read would replace it: `settingStore.ts` drops a read
 * that lands after a set), and two running side by side would each change the
 * list they read and the later write would drop the earlier one's change.
 */
let pendingUpdates = 0;
let updates: Promise<void> = Promise.resolve();

function updateNeedsLogin(change: (ids: readonly number[]) => readonly number[]): Promise<void> {
  pendingUpdates += 1;
  const run = updates.then(async () => {
    try {
      await useNeedsLogin.getState().hydrate();
      const ids = useNeedsLogin.getState().value;
      const next = change(ids);
      if (next !== ids) await useNeedsLogin.getState().setValue(next);
    } finally {
      pendingUpdates -= 1;
    }
  });
  // A failed write must not wedge every later update behind it.
  updates = run.catch(() => undefined);
  return run;
}

/** The mark as stored, once hydrated and once every update already asked for has landed. */
export async function needsLoginIds(): Promise<readonly number[]> {
  await updates;
  await useNeedsLogin.getState().hydrate();
  return useNeedsLogin.getState().value;
}

export function markNeedsLogin(characterId: number): Promise<void> {
  return updateNeedsLogin((ids) => (ids.includes(characterId) ? ids : [...ids, characterId]));
}

export function clearNeedsLogin(characterId: number): Promise<void> {
  // Every successful token fetch lands here: skip the queue when the hydrated
  // list lacks the id and no mark that could add it is still on its way.
  const { hydrated, value } = useNeedsLogin.getState();
  if (hydrated && pendingUpdates === 0 && !value.includes(characterId)) return Promise.resolve();
  return updateNeedsLogin((ids) =>
    ids.includes(characterId) ? ids.filter((id) => id !== characterId) : ids
  );
}

interface AuthFailureState {
  failure: AuthFailure | null;
  reportTokenFailure: (characterId: number) => void;
  reportRequestFailure: (characterId: number, endpointId?: EsiEndpointId) => void;
  dismiss: () => void;
  /**
   * Drop a stale failure — on character switch, or once the grant works again.
   * `kind` narrows what counts as stale: a fresh access token proves the
   * refresh grant is alive but says nothing about a scope a previous read was
   * refused for, so it must not clear a `'request'` failure. A `'token'`
   * clear also drops the needs-login mark: the grant works again.
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
    void markNeedsLogin(characterId);
    set({ failure: { characterId, kind: 'token' } });
  },
  reportRequestFailure: (characterId, endpointId) => {
    if (!outranks('request', get().failure)) return;
    set({ failure: { characterId, kind: 'request', endpointId } });
  },
  dismiss: () => {
    set({ failure: null });
  },
  clearFor: (characterId, kind) => {
    if (kind === undefined || kind === 'token') void clearNeedsLogin(characterId);
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
  const offRequest = onEsiAuthFailure((characterId, endpointId) => {
    useAuthFailure.getState().reportRequestFailure(characterId, endpointId);
  });
  const offGrant = onDeadGrant((characterId) => {
    useAuthFailure.getState().reportTokenFailure(characterId);
  });
  return () => {
    offRequest();
    offGrant();
  };
}

/** Direct publish, for tests and non-React callers that already hold a store. */
export function reportEsiAuthFailure(characterId: number): void {
  useAuthFailure.getState().reportRequestFailure(characterId);
}
