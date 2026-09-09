# Scope decisions — racing SSO logins, and a callback that recovers (issue #649)

_Recorded 2026-09-09 · issue #649._

- **One Pending Login per `state`, not one shared slot.** `startLogin` stores
  `{ verifier, scopes, createdAt }` under `neocom.sso.pkce.<state>`, and
  `completeLogin` takes the entry the returning `state` names. The shared slot
  was a race: `startLogin` writes the stash and only _then_ does the browser
  leave for SSO, so a second press landing in that gap overwrote the verifier
  and state the first, already-committing navigation was about to use. SSO came
  back with a `state` the tab no longer recognised and the login died. This is
  the leading explanation for #649's "when I log in my character in a faster
  way I tend to get the error more. If I take my time logging in, I dont see
  the error appearing." Both round trips now stay valid and whichever returns
  is the one that completes.

- **The first diagnosis was wrong, and is recorded here because the shape
  recurs.** The original theory was that the switch-user round trip delivers
  the same callback twice and the second landing errors over a login that
  already worked. It predicted the Character would be present after the error;
  the reporter checked and it was not ("No the character that I have selected
  to log in with does not appear in the list of characters, even after a
  refresh"), which falsified it. The replay-marker built on that theory was
  removed rather than kept "just in case" — it also carried a real defect,
  since one authorize request can yield more than one code, so a marker keyed
  on `state` alone could hand back the wrong Character silently.

- **A failed callback recovers before it reports.** Restart the sign-in once by
  itself; only when that is spent does the panel appear, and its button
  restarts the sign-in directly. The old panel was a dead end — its only
  control led to `/login`, which `Navigate`s straight back to `/characters` for
  anyone who already has one, so the user could neither see what happened nor
  get out of it.

- **The panel is not skipped for a user who already has Characters.** An
  earlier revision fell back to `/characters` whenever the device had one,
  which reads as success and hides the fact that the Character being added is
  not in the list. It would also have denied #649's reporter — who has
  Characters — the one signal that says which failure they hit.

- **The retry asks for what the original login asked for, and never less.**
  `scopesForRetry` unions every live Pending Login and only then falls back to
  the single `neocom.sso.intent` slot. `/callback` serves every entry point —
  Add Character, a `ScopeGate`, a corp grant — and they ask for different
  scopes, so retrying a failed corp grant as a plain re-auth would succeed
  while silently not granting corp access, the quiet downgrade `loginFlow`
  exists to avoid. The intent slot alone is not enough: it holds the _most
  recent_ request, so with two round trips open it describes whichever started
  last. Under-asking is the failure that matters — SSO issues a token carrying
  exactly what was requested, so a dropped scope is a grant thrown away. No
  record at all means no automatic retry rather than a guess.

- **Nothing after the token is stored may report a failure.** `setActiveCharacter`
  can reject, and letting it reach the panel would put "Login failed" over a
  Character that is signed in — the trade `features/character/addCharacter`
  already makes one layer down, reintroduced above it by an earlier revision of
  this branch and now closed in both places.

- **An SSO `?error=` is terminal.** The commonest one is the user pressing
  Cancel on EVE's page; retrying it bounces them straight back to EVE, which is
  the opposite of honouring it. It gets its own wording, and clears the
  _intent_ rather than the retry budget — clearing the budget would re-arm the
  automatic restart and leave the intent behind as fuel for it.

- **The automatic restart is budgeted, and the budget survives a page load.**
  One retry, counted in `sessionStorage` (`neocom.sso.autoRetries`), cleared on
  success. The retry leaves for SSO and returns to this same route, so an
  unbudgeted one is a redirect loop between the app and EVE that the user
  cannot interrupt. A ref would not do: the retry is a full page load, which is
  exactly what a ref does not survive. No storage means no retry — failing
  closed costs one manual press, failing open risks the loop.

- **Three failures still get three messages.** `LoginError` carries a `reason`
  (`no-login-in-progress` / `state-mismatch`); the exchange's own `AuthError`
  keeps the generic wording. A pending round trip that is not this one is a
  lost race, none at all is a spent or absent stash. Reached only after
  recovery has been exhausted, so the wording is now diagnostic rather than the
  user's whole experience. The panel never renders the thrown Error's own text,
  which may hold an ESI/PKCE internal detail.

- **The pending set is bounded — 15 minutes, 5 entries — and the TTL is
  enforced on redemption, not only on prune.** A per-state store grows where a
  single slot could not. Pruning runs from `startLogin`, so a tab that starts
  no further login would otherwise still redeem an hours-old round trip and the
  documented bound would be fiction. Both numbers are generous next to a round
  trip measured in seconds.

- **The legacy single-slot keys are read, never written.** A tab that left for
  SSO before this shipped comes back holding only `neocom.sso.verifier` /
  `.state` / `.scopes`. Dropping them would fail every login in flight at
  release. Read once and cleared whatever the outcome, so they cannot serve a
  second callback or shadow the per-state store.

- **The `state` check was not relaxed, and must not be.** #649 came from an
  outside reporter who suggested `state` itself was at fault. Treated as a
  hypothesis to test, not a fix to apply: relaxing state validation is how a
  login-CSRF ships — an attacker able to make a victim's browser open
  `/callback?code=<their own code>` would silently bind their Character into
  the victim's app. A `state` with no Pending Login behind it still reaches no
  token endpoint and writes nothing; `session.test.ts` pins that by name. The
  hypothesis is also simply false: `state` is independent `generateVerifier()`
  output encoding nothing, and the one in the report round-tripped intact.

- **Requested Scopes keep their "unknown" reading.** A Pending Login's `scopes`
  is `string[] | undefined`, and anything unreadable answers `undefined`, not
  `[]`. `purgeCacheIfConsentChangedOrPending` treats `undefined` as "no
  baseline" and falls back to the stored grant, which still catches a
  revocation; `[]` would assert the app asked for nothing and quietly disable
  revocation-driven purging. An intermediate revision of this branch lost that
  distinction, which is why it is pinned by its own test.

- **Storage writes are best-effort throughout.** `setItem` throws in
  private-mode webviews and under "block site data". A throw must not be what
  fails an otherwise good login, so every write is wrapped; a login that cannot
  stash fails later at the callback with a real reason instead.
