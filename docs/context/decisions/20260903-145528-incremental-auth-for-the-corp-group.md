# Scope decisions (round 37) — incremental auth for the corp group

_Recorded 2026-09-03._

- **A scope leaves the Base Grant when most users would be consenting to
  something they can never exercise.** All seven corp scopes qualify: CCP
  role-gates the endpoints server-side, so the ~95% of users who hold no Corp
  Role gain nothing from granting them but a longer consent screen. This is a
  product judgement per scope, not a mechanical rule — the default is the Base
  Grant, and `esi-characters.read_corporation_roles.v1` stays in it (round 35)
  precisely because every Character needs it.
- **The base/group split is decided per _endpoint_, and the two sets must never
  overlap.** One ungrouped endpoint declaring a grouped scope would put it back
  on everyone's consent screen with nothing else failing, so `scopes.test.ts`
  asserts the intersection is empty. An overlap is an error to fix at the
  declaration, never something to subtract in the derivation.
- **A whole group is requested, not the individual scopes a Character's roles
  need.** A Character who grants corp access once should not be sent back to
  SSO the day they gain a second role. Readiness stays per capability (round
  35), so a Junior_Accountant is still `ready` on the wallet scopes alone.
- **The login path judges revocation as Requested Scopes vs granted; the
  refresh path keeps previous vs granted.** Incremental auth means an ordinary
  add-a-character login asks for less than some Character on the device holds,
  and reading that as a revocation is the cache-wipe defect of #293. A scope
  the app never asked for going missing from the JWT is no evidence the
  Character revoked it. The refresh path requests nothing at all, so the stored
  grant remains its baseline — and it is the only path a portal-side revoke
  arrives on, so revocation detection is not weakened.
- **Only scopes the Character actually _held_ can be lost.** Not a plain
  "requested minus granted" diff: `SCOPES` asks for the same set every login,
  so a scope SSO never returns — retired upstream, or missing from the EVE
  application's own registration — would otherwise purge the cache on every
  login, forever.
- **Two login branches, split on whether the returning Character is knowable at
  redirect time.** `beginAddCharacterLogin()` asks for the Base Grant alone,
  because SSO decides who comes back _after_ the redirect; its two callers are
  the Login page and the Characters page's Add button. `beginEveLogin()` is
  every other entry point — the Settings Corp access row, the grant prompt, the
  `ReauthBanner`, `ScopeGate`, `AuthFailureNotice` — and unions with that
  Character's own stored grant. Unioning across _every_ stored Character, as
  #293 did, is safe but over-asks: an alt would be shown corp scopes only a
  main ever granted.
- **`beginEveLogin` defaults to the active Character**, rather than making
  ~15 re-auth call sites each name one. Every one of them is pressed while
  looking at one Character's data, so the active Character _is_ what
  "re-authorize" means there; a bare call that asked for the Base Grant instead
  would silently drop that Character's corp grant, since EVE issues a token
  carrying exactly what was requested. Adding a Character is the exception, and
  gets its own function rather than a flag — an active Character is usually
  signed in when Add is pressed, and unioning with _their_ grant is precisely
  the over-ask, aimed at somebody else.
- **The accepted trade: an add-a-character login by an already-granted
  Character narrows its stored grant.** EVE issues a token carrying exactly
  what was requested, so the narrowing is real rather than a bookkeeping
  artefact — but the cache survives, and re-granting is one press in Settings.
- **The grant prompt is offered once per Character per device, and both buttons
  end it.** Declining must not be re-litigated on the next boot, and granting
  makes it moot; a prompt that keeps returning is the same consent bloat
  wearing a different hat. Recorded device-locally, per Character, so an alt
  that later makes Director still gets its own offer.
- **The Settings Corp access row is scoped to the active Character**, like
  `useCorpAccess` itself. Roles are per Character and only knowable by asking
  ESI for each one, so a row per stored Character would mean a read per stored
  Character on every visit to Settings.
- **`none` gets no Grant button.** Granting would widen the consent screen and
  unlock nothing, because the gate that stops it is server-side. It is told
  apart from `roles-without-grant` on sight all the same — all four states are
  distinguishable, which is what makes the row a place to understand the gate
  rather than only act on it.
