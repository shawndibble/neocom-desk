/**
 * One-way notification that a live ESI call failed authentication.
 *
 * Exists so `cache.ts` need not import `src/stores`: the shell owns UI state
 * and `src/esi` sits below it (docs/ARCHITECTURE.md §2). Carries only a
 * characterId and, where the caller knows it, the endpoint that was refused —
 * never an error object, whose message can hold response text. The endpoint is
 * what lets the shell's re-login ask for the Permission that endpoint needs:
 * without it a refused write (a mail send, an RSVP) re-logs-in for the scopes
 * already held, comes back identical and is refused again.
 */
import type { EsiEndpointId } from './registry';

type AuthFailureListener = (characterId: number, endpointId?: EsiEndpointId) => void;

const listeners = new Set<AuthFailureListener>();

/** Returns an unsubscribe. */
export function onEsiAuthFailure(listener: AuthFailureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitEsiAuthFailure(characterId: number, endpointId?: EsiEndpointId): void {
  // A throwing listener must not fail the ESI read that reported it.
  for (const listener of listeners) {
    try {
      // Not `listener(characterId, undefined)`: a listener asserting on its
      // arguments should see exactly what the reporter passed.
      if (endpointId === undefined) listener(characterId);
      else listener(characterId, endpointId);
    } catch {
      // ignored
    }
  }
}
