# Scope decisions — a repeated SSO callback replays instead of failing (issue #649)

_Recorded 2026-09-09 · issue #649._

- **A callback that lands twice is a success, not a failure.** `completeLogin`
  writes a `neocom.sso.completed` marker (`{ state, characterId }`) once the
  exchange has persisted the Character, and a later callback carrying that same
  `state` with no PKCE stash left returns the stored `CharacterRecord` instead
  of throwing. This is the **leading hypothesis for #649, not a confirmed
  diagnosis**: the report is a switch-user round trip on EVE's login page
  ending on a "Login failed" panel, and a second landing on the same
  `/callback?code=…&state=…` is the one shape that raises an error over a
  session that in fact exists, since the first landing already spent the
  one-shot stash. `Callback.tsx`'s `started` ref cannot cover it — a ref spans
  one mount, and a second landing is a fresh page load. What would confirm it:
  the Character being present on `/characters` after the error panel. The
  reporter was asked; the fix did not wait on the answer, because the change is
  correct on its own terms either way. If instead `sessionStorage` is being
  lost across the round trip, the marker is lost with it, replay does not fire,
  and the user sees the spent-link wording — a better message, the same dead
  end, and a distinct follow-up.

- **The marker is written after the stash is spent, and is not part of it.**
  The verifier/state/scopes stash stays exactly one authorize round trip long,
  for the reason its own doc comment gives: a stale one would let
  `purgeCacheIfConsentChangedOrPending` treat an old request as the baseline
  for grants it had nothing to do with. Rules out the tempting alternative —
  holding the stash back until the exchange succeeds — which would extend that
  lifetime for real.

- **The marker cannot mint a session.** It holds a spent CSRF nonce that was in
  the URL bar anyway and a character id; a match short-circuits to a Character
  the device already has, never to a token exchange. No `code`, no verifier, no
  token material touches it (ADR 0001). Both halves are checked strictly: the
  `state` must be the one on this callback, and the Character must still be in
  Dexie — one removed since is a real "no login in progress", since replaying
  it would navigate to a Character that is gone.

- **Three failures, three messages.** `LoginError` carries a
  `reason` (`no-login-in-progress` / `state-mismatch`), and the exchange's own
  `AuthError` keeps the generic wording. The single "Something went wrong
  signing you in" made a spent link, a mismatched state and an EVE-rejected
  code indistinguishable in a bug report — #649 arrived with a screenshot that
  could have been any of them. The panel still never renders the thrown
  Error's own text, which may carry an ESI/PKCE internal detail.

- **Replay is consulted only when the stash is absent, deliberately.** A
  `state-mismatch` means a _newer_ login is in flight, and adopting an older
  completed one would be the wrong Character. The switch-user sequence never
  hits it — nothing calls `startLogin` between the two landings.

- **The replay is bounded by a window and a count, and the breaker latches.**
  Five minutes and three replays. A marker that never expires is a
  short-circuit that never expires with it — a months-old callback URL
  reopened in the same tab would silently "succeed", and anything redelivering
  `/callback` in a cycle would be replayed without bound. The count is the
  breaker proper: a window alone still permits unlimited replays inside it.
  Tripping either clears the marker for good, so the honest "already used"
  error is what a repeat gets once it has stopped looking like one browser
  redelivering one callback. Checked first: no navigation cycle exists to feed
  such a loop today — `RequireCharacter` gates on Character _count_, not on an
  active Character, so the `/characters` the replay lands on never bounces
  back to `/login`, and nothing in the app navigates to `/callback`.

- **The `state` check was not relaxed, and must not be.** #649 came from an
  outside reporter who suggested `state` itself was the fault. Treated as a
  hypothesis to test, not a fix to apply: relaxing state validation is exactly
  how a login-CSRF ships — an attacker able to make a victim's browser open
  `/callback?code=<their own code>` would silently bind their Character into
  the victim's app. The mismatch branch still throws before any token request.
  The replay branch is not a hole in that: it never exchanges a code (it
  ignores `params.code` outright), never writes a token, and can only return a
  Character already in this device's Dexie, gated on a 32-byte nonce an
  attacker cannot predict. `session.test.ts` pins both properties by name so a
  later "fix" cannot quietly undo them.

- **The reporter's `state` hypothesis is ruled out, not deferred.** `state` is
  an independent 32-byte random value from `generateVerifier()`; it encodes no
  account or character id, and the one in the report round-tripped intact.
