// Kicks off EVE SSO: stash PKCE state, then leave the app for login.eveonline.com.
import {
  startAlertsLogin,
  startCorpSyncLogin,
  startFeederGrantLogin,
  startLogin,
  scopesForRetry,
  takeRetryBudget,
} from '@/auth/session';
import { clearLoginReturnTo, setLoginReturnTo, takeLoginReturnTo } from '@/auth/loginReturnTo';
import { CORE_GRANT, SCOPES, scopesForGroup } from '@/esi/scopes';
import type { ScopeGroup } from '@/esi/registry';
import { db } from '@/db';
import type { AlertsExtraState } from '@/features/notifications/alertsGrant';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { assignLocation } from './navigation';
import { currentRouterPath, isOnRoute } from './routerPath';

export interface EveLoginOptions {
  /**
   * The Character this login is *for*. Defaults to the active one, which is
   * what the shell-level entry points mean: the `AuthFailureNotice`, a
   * `ScopeGate` — both pressed while looking at the active Character's data.
   * Per-page Grant CTAs go through `grantAction.ts`'s `beginGrant`, which
   * always names the Character, since in a multi-Character view it is often
   * not the active one.
   */
  characterId?: number;
  /** Opt-in scope groups to add to the request, e.g. `['corp']`. */
  groups?: readonly ScopeGroup[];
}

/**
 * The scope set to ask SSO for.
 *
 * With no known Character (`characterId === null`, i.e. Add Character), the
 * returning identity is unknowable until EVE sends them back, so this asks
 * for the whole `SCOPES` (Base Grant) and nothing else — the decision doc's
 * "plain login still asks for the whole Base Grant" rule.
 *
 * With a known Character, this is a re-login for someone already looking at
 * their own data — a `ReauthBanner`, a `ScopeGate`, a Grant button — so
 * re-asking for the whole Base Grant would silently re-request every
 * Permission the Character declined at sign-in (issue #1520). It asks for
 * just the `CORE_GRANT`, plus any named `groups` (the one Permission a
 * banner's endpoints resolved to, or an opt-in group like `corp`), plus
 * `characterId`'s own stored grant.
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
  if (characterId === null) return [...new Set(SCOPES)];
  const base = [...CORE_GRANT, ...groups.flatMap((group) => [...scopesForGroup(group)])];
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
 * Every caller is pressed from a Character context: a page's Grant CTA
 * (`grantAction.ts`'s `beginGrant`), the `AuthFailureNotice`, a `ScopeGate`,
 * the Settings Permissions rows, the corp grant prompt. So the request unions with that Character's stored grant, and
 * asking for less would quietly throw away a grant they already made — EVE
 * issues a token carrying exactly what was requested, so the loss is real.
 * Here `previous vs granted` stays meaningful and a genuine revocation is
 * still detected.
 *
 * The Character defaults to the active one, because that is what "re-authorize"
 * means at the shell-level call sites (`AuthFailureNotice`, `ScopeGate`);
 * `beginGrant` always names it instead. With no active Character there is
 * nothing to union with and this is the base set — the same conservative answer
 * as an unreadable Dexie.
 *
 * Every caller is pressed while looking at a page, so the callback returns to
 * it rather than to `/characters`.
 */
export async function beginEveLogin(options: EveLoginOptions = {}): Promise<void> {
  const characterId = options.characterId ?? useActiveCharacter.getState().activeCharacterId;
  rememberThisPage();
  assignLocation(await startLogin(await requestedScopes(characterId, options.groups ?? [])));
}

/**
 * One EVE sign-in for a Character's Alerts Grant (ADR 0020), returning to the
 * page it was pressed on. `wanted` names the optional scopes the player agreed
 * to on the permission listing (issue #5156); SSO issues a token with exactly
 * what was requested, so a scope the Character's grant already holds is always
 * kept. A scope is asked for only once the deployed server has said it takes it
 * (ADR 0028, 0029). Called without `wanted` (the first-run offer, which says so
 * in its own copy) it asks for the location when supported and never for new mail.
 * The callback never stores its token on this device; see
 * `features/notifications/alertsGrant.ts`.
 */
export async function beginAlertsLogin(
  characterId: number,
  { nearby = true, mail = false }: { nearby?: boolean; mail?: boolean } = {}
): Promise<void> {
  const { readAlertsNearby, readAlertsMail } = await import('@/features/notifications/alertsGrant');
  const none = (): AlertsExtraState => ({ supported: false, characterIds: [] });
  const nearbyState = await readAlertsNearby().catch(none);
  const mailState = await readAlertsMail().catch(none);
  rememberThisPage();
  assignLocation(
    await startAlertsLogin(characterId, undefined, {
      nearby: nearbyState.supported && (nearby || nearbyState.characterIds.includes(characterId)),
      mail: mailState.supported && (mail || mailState.characterIds.includes(characterId)),
    })
  );
}

/**
 * Turn on the Corp Tax Book's Automatic sync for one book editor (ADR 0025): a
 * separate SSO round trip for the grant's scopes alone, returning to the page it
 * was pressed on. The callback never stores its token on this device; see
 * `features/corp/taxBook/syncGrant.ts`.
 */
export async function beginCorpSyncLogin(
  characterId: number,
  corporationId: number
): Promise<void> {
  rememberThisPage();
  assignLocation(await startCorpSyncLogin(characterId, corporationId));
}

/**
 * Grant a moon owner's ledger to an accounting corporation (ADR 0025 amendment):
 * a separate SSO round trip where the player picks the Accountant Character on
 * EVE's login screen, returning to the page it was pressed on.
 */
export async function beginFeederGrantLogin(
  characterId: number,
  inviteCode: string,
  requestedRatePct?: number
): Promise<void> {
  rememberThisPage();
  assignLocation(await startFeederGrantLogin(characterId, inviteCode, requestedRatePct));
}

/**
 * Stash the current page as the post-login landing. `/callback` is never
 * remembered: its query is the spent code, and its error panel restarts
 * through `retryLastLogin`, which keeps the failed login's own landing. A
 * protocol-relative `//host` path is refused rather than handed to the router.
 */
function rememberThisPage(): void {
  const here = currentRouterPath();
  if (here.startsWith('//') || isOnRoute(here, '/callback')) return;
  setLoginReturnTo(here);
}

/**
 * Add Character lands where it ordinarily does, so a landing a grant left
 * behind (pressed, then abandoned on EVE's page) must not steer it. Two pages
 * keep the stash: `/login`, where a Fitting Share Code's "Open in Neocom Desk"
 * (#1544) sent the visitor with its landing already stashed, `/callback`,
 * whose Retry fallback restarts the very login that landing belongs to, and
 * `/s` and `/share` (the old spelling), whose "Log in" stashes the shared page
 * before it starts (#3075), and `/communities/join`, whose invite page does the
 * same so a visitor lands back on the invite after EVE's login, and
 * `/corp-tax-book/verify`, where a guest signs in as the character they are
 * confirming into a grouping and returns to the Statement (#4210), and
 * `/corp-tax-book/remove-now`, where a payee signs in and returns to the link (#4520).
 */
const LANDING_KEEPING_ROUTES = [
  '/login',
  '/callback',
  '/s',
  '/share',
  '/communities/join',
  '/corp-tax-book/verify',
  '/corp-tax-book/remove-now',
];

function forgetStrayLanding(): void {
  const here = currentRouterPath();
  if (!LANDING_KEEPING_ROUTES.some((route) => isOnRoute(here, route))) clearLoginReturnTo();
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
  forgetStrayLanding();
  assignLocation(await startLogin(await requestedScopes(null, [])));
}

/**
 * Add a Character with a hand-picked set of Permissions — the Customize
 * permissions dialog's own submit (issue #1522). Same "nobody to union with"
 * reasoning as `beginAddCharacterLogin`: the returning identity is unknowable
 * until EVE sends them back. Unlike that base request, `groups` here may omit
 * a default-on Permission (an unchecked box) or include an opt-in one
 * (Corporation, Structure markets) — Customize offers all 15 either way.
 */
export async function beginCustomizedAddCharacterLogin(
  groups: readonly ScopeGroup[]
): Promise<void> {
  const scopes = [...new Set([...CORE_GRANT, ...groups.flatMap((group) => scopesForGroup(group))])];
  forgetStrayLanding();
  assignLocation(await startLogin(scopes));
}

/**
 * Restart whatever login this tab last began, asking for the same scopes.
 *
 * `false` when this tab has no record of one, which is the honest answer: the
 * callback route cannot tell an Add Character from a corp grant, and guessing
 * would retry a scope grant as a plain re-auth — succeeding while silently not
 * granting what was asked for.
 *
 * The retry is a fresh Pending Login, so the landing's clock restarts with it;
 * otherwise a slow first attempt could expire the landing mid-retry.
 */
export async function retryLastLogin(): Promise<boolean> {
  const scopes = scopesForRetry();
  if (!scopes) return false;
  const landing = takeLoginReturnTo();
  if (landing !== null) setLoginReturnTo(landing);
  assignLocation(await startLogin(scopes));
  return true;
}

/** `retryLastLogin`, but only while the automatic-restart budget allows it. */
export async function retryLastLoginOnce(): Promise<boolean> {
  return takeRetryBudget() ? retryLastLogin() : false;
}
