# Login, Callback and auth (EVE SSO)

Routes `/login` (`src/routes/Login.tsx`), `/callback` (`src/routes/Callback.tsx`), outside `RequireCharacter`/`ScopeGate`, eagerly loaded (`src/app/App.tsx:339-340`). Engine `src/auth/` (`sso.ts`, `session.ts`, `pkce.ts`, `jwt.ts`, `loginReturnTo.ts`); entry points `src/app/loginFlow.ts`, `src/features/character/addCharacter.ts`, `src/features/permissions/`. EVE SSO v2 + PKCE; refresh tokens in Dexie only (ADR 0001).

| Feature                                         | Where                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| Landing page for signed-out users               | `Login.tsx`                                                                 |
| "Log in with EVE Online" button                 | `SsoButton` `Login.tsx:679`                                                 |
| Custom permissions dialog                       | `CustomizePermissionsDialog.tsx`                                            |
| SSO redirect, PKCE, state                       | `session.ts startLogin`, `sso.ts buildAuthorizeUrl`                         |
| Callback: exchange, error panel, one auto retry | `Callback.tsx`                                                              |
| Token store, refresh, cross-tab single-flight   | `session.ts getValidAccessToken`, `persistTokens`                           |
| Consent-change cache purge                      | `purgeCacheIfConsentChangedOrPending`                                       |
| Post-login landing stash                        | `loginReturnTo.ts`                                                          |
| Re-auth / grant for known Character             | `loginFlow.ts beginEveLogin`, `app/grantAction.ts`, `AuthFailureNotice.tsx` |
| Root gate                                       | `Root`, `RequireCharacter`                                                  |

## Purpose / user goal

Sign in with EVE SSO (first Character, or add an alt), choose how much to grant, recover from failures, and understand what the app asks for before consenting.

## Login page controls and content

- Shown only with zero Characters: any Character -> `Navigate('/characters')` (`Login.tsx:264`); count loading -> `BootScreen gate="login"`.
- Play Store (TWA) variant (`isPlayStoreApp`, referrer-based, read once): logo, name, login, customize link only.
- Marketing sections (`login.*`): header; hero (eyebrow "Free . Open source . Runs on your device", heading "Answers, not API dumps.", tagline, login + customize buttons, static preview board with sample "Aurelia Vex" data using `overview.board.*` keys, `PREVIEW` `Login.tsx:205`); 6 "answers" cards; screenshot gallery (6 desktop scroll-snap + 4 phone, sample data, `/screenshots/*.webp`, click opens `Modal placement="media"`, lazy images with fixed size); feature catalog (Command, Progression, Economy, Social); trust cards ("Five writes, and nothing else", refresh token stays on device, offline, open source) with `login.permissionsHint` (read scopes) and a privacy-policy link; the five writes are listed in the first trust card; closing CTA; footer (GitHub, `/privacy.html`, `/data-credit.html`, Discord).
- Login click -> `beginAddCharacterLogin()` (Base Grant), `pending` spinner/disabled; error resets.

## Scopes and Permissions

- Source of truth `src/esi/registry.ts`; `src/esi/scopes.ts` derives `CORE_GRANT` (scopes without a group), `DEFAULT_ON_GROUPS`, `SCOPES` (Base Grant = Core + default-on), `scopesForGroup`.
- `SCOPE_GROUPS` (`registry.ts:53`) has 16 groups: wallet, marketOrders, contracts, assets, industry, mining, planets, mail, calendar, notifications, characterDetails, fittings, autopilot, currentShip (14 default-on; `currentShip` = `esi-location.read_ship_type.v1`, label "Current ship", read by `features/character/ship.ts`) plus corp, structureMarkets (opt-in).
- Plain login/Add: whole Base Grant, never unioned with other Characters' grants (#295; revocation judged requested-vs-granted).
- Re-auth/Grant for a known Character: Core + named groups + that Character's stored scopes (never narrows); remembers current page (`rememberThisPage`; refuses `/callback` and `//host`).
- `CustomizePermissionsDialog` (#1522): Core rows locked (skills and queue, structure lookup, tagged Required); iterates all `SCOPE_GROUPS` (`CustomizePermissionsDialog.tsx:146`, count `:140`) in two columns (one on phone), corp and structure markets tagged Opt-in and unchecked; Select all / Select none; counter "Optional . N of 15"; submit "Log in with selected permissions" -> `beginCustomizedAddCharacterLogin`. Selection persists device-locally only on submit (`customizeSelection.ts`); controls disabled until hydrated; persist failure still logs in.
- Settings > Permissions (`PermissionsPanel.tsx`) changes the grant later.

## Callback flow

- Reads `code`, `state`, `error`; runs once (StrictMode ref). `?error=` -> terminal `SsoRejection` (`access_denied` -> "Login was cancelled..."; else generic). Missing params -> generic.
- `addCharacter` -> `completeLogin`: find Pending Login by `state` (one-shot remove) -> `exchangeCode` POST `login.eveonline.com/v2/oauth/token` (15 s timeout) -> `persistTokens` (decode JWT `sub` `CHARACTER:EVE:<id>`, `name`, `owner`, `exp`, `scp`; no signature check, ESI verifies) -> Dexie `characters` + `tokens` -> account-wide Editable Data backfill for a Character new to the device (`addCharacter.ts`, swallowed on failure).
- First Character becomes active (failure ignored). Navigate (replace) to `takeLoginReturnTo()` else `/overview` on first-ever login (#1771) else `/characters`.
- Failure: non-rejection errors try `retryLastLoginOnce()` (`MAX_AUTO_RETRIES = 1`, stored budget since retry is a full page load) before the panel. Panel "Login failed" text: spent link / other tab (`no-login-in-progress`), lost race (`state-mismatch`), denied, generic (never the thrown text). "Try again": clear budget, `retryLastLogin()` (same scopes) else `beginAddCharacterLogin()`. Panel is `role="alert"`; never skipped for users with Characters.

## Persistence / sync

Dexie `characters`, `tokens` (refresh token never leaves device). `sessionStorage`: Pending Logins keyed `PKCE_PREFIX+state` (TTL 15 min, bounded count, legacy single-slot read), last-login intent, retry budget, `neocom.loginReturnTo` (consumed on read, same TTL). Customize selection device-local. Nothing synced.

## Session, refresh, failure handling

- `startLogin`: 32-byte verifier and independent state (base64url), S256 challenge; redirect `${origin}${BASE_URL}callback`; client id `VITE_EVE_CLIENT_ID`.
- `getValidAccessToken`: single-flight per Character in-tab and across tabs (Web Lock `neocom:refresh:<id>`), token row read inside the lock, 60 s expiry buffer (`EXPIRY_BUFFER_MS`, `session.ts:115`), keeps old refresh token if SSO omits it.
- `persistTokens` purge triggers: previously held scope lost, `ownerHash` changed, pending earlier purge; never for a scope the app did not request, first login, or legacy record without `scopes`. Purge happens before the record write; a failing purge degrades (escalates to full clear) and never fails the session. Corp change purges corp-keyed rows only (`recordCharacterCorporation`).
- `AuthError` codes: `invalid_grant` (dead grant), `unknown_error`, `network_error`, `timeout`.
- Runtime: `AuthFailureRedirect` (total failure of active Character -> `/login` once, `state.from` recorded); `AuthFailureNotice` (partial 401/403 -> dismissible "EVE access was refused" with login, skipped when page owns reauth); `ScopeGate`/`GrantBanner` for explicit grants.
- Gates: `/` -> `Root` (no Characters `/login`; none active `/characters`; else `/overview`); `RequireCharacter` -> `/login` with `state.from` (recorded, not consumed).

## Decisions

`20260909-101500-racing-sso-logins-and-a-callback-that-recovers.md`, `20260907-010343-login-page-sells-the-shipped-product-and-a.md`, `20260924-165646-login-page-drops-the-read-only-claim-and.md`, `20260925-182747-first-login-with-one-character-goes-to-overview.md`, `20260924-143410-customize-permissions-at-sign-in-core-grant-plus.md`, ADR 0001 (no tokens to backend).

## Tests (what they assert)

- `Login.test.tsx`: Play Store variant shows only logo, name, button; hero heading + SSO button; footer repo link; leads with the questions; screenshots with alt and lazy; click enlarges in dialog; feature catalog names shipped surfaces; preview uses the board's own labels; no unresolved i18n keys; trust points and scope enumeration; never says "read-only" since Base Grant has writes; each write disclosed in its own line; every Base Grant scope disclosed and nothing retired; redirect to `/characters` when a Character exists; spinner while pending; opens custom dialog; builds PKCE authorize URL and navigates.
- `Callback.test.tsx`: completes once under StrictMode, first login `/overview`, existing roster `/characters`, stashed return-to wins; new Character gets account-wide pins; restarts once (#649), stops after one, restarts the login actually asked for, no retry without a record, cancel is final and leaves no retry fuel, still reports to users with Characters, post-login hiccup shows no error, success clears budget/intent, panel Try again restarts, lost race vs spent link worded apart, generic on rejected code, panel announced, missing params error.
- `auth/session.test.ts`: authorize URL challenge matches verifier; env defaults; state mismatch rejected without token call; failure reasons; racing logins both valid with own scopes; spent trip cannot re-exchange; forged callbacks create nothing; abandoned/expired/bounded pending; retry never asks for less; legacy in-flight login finishes; cached token >60 s; near-expiry refresh persists rotation; single flight (also across tabs via Web Locks, and without them); record read inside the flight; refresh token kept when omitted; purge matrix (narrower purges; wider, unchanged, first, legacy, asked-for-less, never-held do not; denied-requested purges; refresh revocation purges; other characters and global rows spared; purge before overwrite); owner change purges; failing purge degrades; corp change purges only corp rows; character write skipped when equal.
- `auth/sso.test.ts`: v2 URL with PKCE params; form-encoded exchange, no Authorization header; typed `AuthError`; timeout rejects; refresh grant and revoked token. `jwt.test.ts`: decode, `scp` as string or missing, malformed `sub`/non-JWT throw. `pkce.test.ts`: 43-char verifier, unique, RFC 7636 vector. `loginReturnTo.test.ts`: round trip, consume on read, TTL expiry, outlives EVE page.
- `app/loginFlow.test.ts`: Add sends base SCOPES, no corp scope, no inherited grants (other or active), legacy record ignored; re-auth unions only that Character, Core only without grant, defaults to active; landing remembered (query/hash), not `/callback`, not `//`; Add drops stray landing but keeps `/login` one; customized: none = Core only, all default = SCOPES, unchecked omitted, opt-in allowed; group request = Core + group; broken Dexie falls back to Core.
- `CustomizePermissionsDialog.test.tsx`: Core rows checked+disabled, defaults 13 on / 2 off, Required/Opt-in tags, count updates, Select all checks all 15, Select none keeps Core, Cancel persists nothing, stored selection restored, disabled until hydrated, persist failure still logs in, remembers submit.

## Interview Q&A

1. Why PKCE, no secret? Browser app; verifier+S256 (`session.ts startLogin`, `pkce.ts`).
2. Where do tokens live? Dexie only (ADR 0001).
3. Concurrent refreshes? Single-flight + Web Lock, row read inside (`session.ts:564-580`).
4. Racing logins? Pending keyed by `state`, TTL 15 min (#649).
5. Callback recovery? One auto retry unless SSO `?error=`; panel with reason; Try again keeps scopes.
6. Re-auth vs Add scopes? Known: Core+groups+stored (never narrows); Add: Base Grant (#295, #1520).
7. When is cache purged? Held scope lost, ownerHash change, pending purge.
8. No JWT verification? TLS source; ESI verifies (`jwt.ts`).
9. Landing? Stash, else Overview first login, else Characters.
10. Total vs partial failure? Redirect once vs dismissible banner.
11. Play Store variant? Referrer-detected bare screen.

## Observed gaps

- Dead-grant redirect to `/login` is bounced by `Login` to `/characters` (`Login.tsx:264`) with no message; `state.from` unused. `useAuthFailure` is read only by `AuthFailureNotice`, `tokenProvider`, `PlanetaryIndustry`.
- Stale "13" text: `src/app/loginFlow.ts:146` ("Customize offers all 13 either way") and `CustomizePermissionsDialog.tsx:11` ("all 13 Permissions") vs `SCOPE_GROUPS` = 15 (`registry.ts:53`); the dialog renders all 15 (`:146`, test "every one of the 15"); `loginFlow.test.ts:359` also says "all 13".
- Landing preview uses hard-coded sample data (`Login.tsx:205`).
- Landing permission copy is prose (`login.permissionsHint`), not generated from `PERMISSIONS`.
- No logout control here (Settings > Data & storage).

## Improvement ideas

- Explain dead-grant redirect and honour `state.from`.
- Generate permission copy from `PERMISSIONS`; fix "13" comments.
