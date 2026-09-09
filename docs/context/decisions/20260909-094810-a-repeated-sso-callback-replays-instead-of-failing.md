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

- **The reporter's `state` hypothesis is ruled out, not deferred.** `state` is
  an independent 32-byte random value from `generateVerifier()`; it encodes no
  account or character id, and the one in the report round-tripped intact.
