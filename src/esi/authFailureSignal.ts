/**
 * One-way notification that a live ESI call failed authentication.
 *
 * Exists so `cache.ts` need not import `src/stores`: the shell owns UI state
 * and `src/esi` sits below it (docs/ARCHITECTURE.md §2). Carries only a
 * characterId — never an error object, whose message can hold response text.
 */
type AuthFailureListener = (characterId: number) => void;

const listeners = new Set<AuthFailureListener>();

/** Returns an unsubscribe. */
export function onEsiAuthFailure(listener: AuthFailureListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitEsiAuthFailure(characterId: number): void {
  // A throwing listener must not fail the ESI read that reported it.
  for (const listener of listeners) {
    try {
      listener(characterId);
    } catch {
      // ignored
    }
  }
}
