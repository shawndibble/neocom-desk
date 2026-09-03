// Kicks off EVE SSO: stash PKCE state, then leave the app for login.eveonline.com.
import { startLogin } from '@/auth/session';
import { SCOPES, scopesForGroup } from '@/esi/scopes';
import type { ScopeGroup } from '@/esi/registry';
import { db } from '@/db';
import { assignLocation } from './navigation';

export interface EveLoginOptions {
  /**
   * The Character this login is *for*, when the app knows. Its stored grant
   * joins the request, so a re-auth can never narrow what that Character
   * already consented to. Omit it for "add a character", where SSO decides who
   * comes back and there is no grant to union with.
   */
  characterId?: number;
  /** Opt-in scope groups to add to the request, e.g. `['corp']`. */
  groups?: readonly ScopeGroup[];
}

/**
 * The scope set to ask SSO for. Two branches, split on whether the returning
 * Character is knowable at redirect time (issue #295).
 *
 * **Add a character** — `characterId` omitted. The base `SCOPES` and nothing
 * else. The app genuinely cannot know whose grant to union with here: the user
 * picks the character on EVE's side, *after* this redirect. #293 answered that
 * by unioning across every stored character, which is safe but over-asks — an
 * alt re-authing would be shown corp scopes only a main ever granted, the
 * exact consent bloat incremental auth exists to avoid. What makes asking for
 * less safe now is that `auth/session` judges revocation as **requested vs
 * granted**: a scope the app did not ask for going missing from the JWT is not
 * evidence the Character revoked it, so it purges nothing.
 *
 * **Re-auth or grant for a known Character** — `characterId` given. Every such
 * entry point (the Settings Corp access row, the role-gain prompt, the
 * `ReauthBanner`) is initiated from a Character context, so the union is both
 * possible and required: asking for less than that Character already holds
 * would quietly throw the surplus away, and here `previous vs granted` is
 * meaningful again, so a genuine revocation is still detected.
 *
 * Unioning *stored* scopes rather than naming new ones is also what keeps the
 * second branch safe: every scope in that union was granted to this client id
 * already, so SSO cannot reject the request as asking for something the
 * application is not registered for.
 */
async function requestedScopes(options: EveLoginOptions): Promise<string[]> {
  const groupScopes = (options.groups ?? []).flatMap((group) => [...scopesForGroup(group)]);
  const base = [...SCOPES, ...groupScopes];
  if (options.characterId === undefined) return [...new Set(base)];
  try {
    const token = await db.tokens.get(options.characterId);
    // `?? []` as everywhere else that reads a stored grant (app/prefetch.ts,
    // app/useGrantedScopes.ts): `scopes` post-dates the table, so a record
    // written before it exists has no such field however the type reads.
    return [...new Set([...base, ...(token?.scopes ?? [])])];
  } catch {
    // A broken Dexie may cost the user their cache; it must never cost them
    // their way back in — nor turn a Grant press into a plain re-auth, which
    // is why the requested group is in `base` rather than added below.
    return [...new Set(base)];
  }
}

export async function beginEveLogin(options: EveLoginOptions = {}): Promise<void> {
  assignLocation(await startLogin(await requestedScopes(options)));
}
