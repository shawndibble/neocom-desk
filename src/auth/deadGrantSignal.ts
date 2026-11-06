/**
 * One-way notification that a Character's refresh grant is dead (SSO answered
 * `invalid_grant`), whoever was asking for the token.
 *
 * Exists so `session.ts` need not import `src/stores`: the shell owns UI state
 * and `src/auth` sits below it. Before this, only the ESI client's token
 * provider reported a dead grant, so a sync, SRP or corp tax book call that hit
 * one failed silently with no re-login prompt. Carries only a characterId,
 * never an error object, whose message can hold response text.
 */
type DeadGrantListener = (characterId: number) => void;

const listeners = new Set<DeadGrantListener>();

/** Returns an unsubscribe. */
export function onDeadGrant(listener: DeadGrantListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDeadGrant(characterId: number): void {
  for (const listener of listeners) {
    // A throwing listener must not mask the auth error the caller is about to see.
    try {
      listener(characterId);
    } catch {
      /* ignore */
    }
  }
}
