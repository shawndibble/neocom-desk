// Kicks off EVE SSO: stash PKCE state, then leave the app for login.eveonline.com.
import { startLogin } from '@/auth/session';
import { SCOPES } from '@/esi/scopes';
import { db } from '@/db';
import { assignLocation } from './navigation';

/**
 * The scope set to ask SSO for: `SCOPES` unioned with every grant already
 * stored on this device.
 *
 * A constant `SCOPES` was safe only while it was also the widest set anyone
 * held. The moment a character has been granted more than the base — the point
 * of incremental auth — an ordinary login asking for the base alone comes back
 * as a *narrower* grant, which `auth/session` correctly reads as a revocation
 * and answers by purging that character's whole cache (issue #293).
 *
 * The union is over *all* stored characters, not the active one, because at
 * this point the app does not know who is coming back: the user chooses the
 * character on EVE's side, after this redirect. Asking for the union is what
 * makes the answer a superset whoever it turns out to be.
 *
 * Unioning *stored* scopes rather than naming any is also what keeps this
 * safe: every scope in the union was granted to this client id already, so SSO
 * cannot reject the request as asking for something the application is not
 * registered for.
 */
async function requestedScopes(): Promise<string[]> {
  try {
    const stored = await db.tokens.toArray();
    // `?? []` as everywhere else that reads a stored grant (app/prefetch.ts,
    // app/useGrantedScopes.ts): `scopes` post-dates the table, so a record
    // written before it exists has no such field however the type reads.
    const granted = stored.flatMap((token) => token.scopes ?? []);
    return [...new Set([...SCOPES, ...granted])];
  } catch {
    // A broken Dexie may cost the user their cache; it must never cost them
    // their way back in. The base set is what this always sent.
    return [...SCOPES];
  }
}

export async function beginEveLogin(): Promise<void> {
  assignLocation(await startLogin(await requestedScopes()));
}
