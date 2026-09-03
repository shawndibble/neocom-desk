// Kicks off EVE SSO: stash PKCE state, then leave the app for login.eveonline.com.
import { startLogin } from '@/auth/session';
import { SCOPES, scopesForGroup } from '@/esi/scopes';
import type { ScopeGroup } from '@/esi/registry';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { assignLocation } from './navigation';

export interface EveLoginOptions {
  /**
   * The Character this login is *for*. Defaults to the active one, which is
   * what every re-auth entry point means: a `ReauthBanner`, the
   * `AuthFailureNotice`, a `ScopeGate` — all of them are pressed while looking
   * at one Character's data. Pass it explicitly only where the Character is not
   * the active one.
   */
  characterId?: number;
  /** Opt-in scope groups to add to the request, e.g. `['corp']`. */
  groups?: readonly ScopeGroup[];
}

/**
 * The scope set to ask SSO for: the base `SCOPES`, plus any requested group,
 * plus `characterId`'s own stored grant when there is a Character to union
 * with. `null` means there is not — see the two branches on the exported
 * functions below.
 *
 * Unioning *stored* scopes rather than naming new ones is what keeps the union
 * safe: every scope in it was granted to this client id already, so SSO cannot
 * reject the request as asking for something the application is not registered
 * for.
 */
async function requestedScopes(
  characterId: number | null,
  groups: readonly ScopeGroup[]
): Promise<string[]> {
  const base = [...SCOPES, ...groups.flatMap((group) => [...scopesForGroup(group)])];
  if (characterId === null) return [...new Set(base)];
  try {
    const token = await db.tokens.get(characterId);
    // `?? []` as everywhere else that reads a stored grant (app/prefetch.ts,
    // app/useGrantedScopes.ts): `scopes` post-dates the table, so a record
    // written before it exists has no such field however the type reads.
    return [...new Set([...base, ...(token?.scopes ?? [])])];
  } catch {
    // A broken Dexie may cost the user their cache; it must never cost them
    // their way back in — nor turn a Grant press into a plain re-auth, which
    // is why the requested group is already in `base`.
    return [...new Set(base)];
  }
}

/**
 * Re-auth, or grant a scope group, **for a known Character** — the second of
 * the two branches incremental auth splits login into (issue #295).
 *
 * Every caller is pressed from a Character context: a `ReauthBanner`, the
 * `AuthFailureNotice`, a `ScopeGate`, the Settings Corp access row, the corp
 * grant prompt. So the request unions with that Character's stored grant, and
 * asking for less would quietly throw away a grant they already made — EVE
 * issues a token carrying exactly what was requested, so the loss is real.
 * Here `previous vs granted` stays meaningful and a genuine revocation is
 * still detected.
 *
 * The Character defaults to the active one, because that is what "re-authorize"
 * means at every one of those call sites. With no active Character there is
 * nothing to union with and this is the base set — the same conservative answer
 * as an unreadable Dexie.
 */
export async function beginEveLogin(options: EveLoginOptions = {}): Promise<void> {
  const characterId = options.characterId ?? useActiveCharacter.getState().activeCharacterId;
  assignLocation(await startLogin(await requestedScopes(characterId, options.groups ?? [])));
}

/**
 * Add a Character — the first branch, and the one where the returning identity
 * is genuinely unknowable: the user picks the character on EVE's side, *after*
 * this redirect. So it asks for the base `SCOPES` and nothing else, unioning
 * with no one.
 *
 * #293 unioned across every stored Character instead, because it could not
 * under-ask without tripping the cache purge. That is safe but over-asks: an
 * alt would be shown corp scopes only a main ever granted, the exact consent
 * bloat incremental auth exists to avoid. What makes asking for less safe now
 * is that `auth/session` judges revocation as **requested vs granted** — a
 * scope the app did not ask for going missing from the JWT is not evidence the
 * Character revoked it, so it purges nothing.
 *
 * Deliberately not `beginEveLogin()` with the default: an active Character is
 * usually signed in when this is pressed, and unioning with *their* grant is
 * precisely the over-ask, aimed at somebody else.
 */
export async function beginAddCharacterLogin(): Promise<void> {
  assignLocation(await startLogin(await requestedScopes(null, [])));
}
