# Scope decisions — Network failures are not auth failures; navigator.onLine is advisory

_Recorded 2026-10-15._

- **A call that never reached SSO or ESI is a network failure, never an auth failure.** An `AuthError` with status 0 (`network_error`, `timeout`) and `EsiOfflineError` never set `needsReauth` and never raise the shell auth-failure notice. `isAuthFailure` is false for them, so the read-through cache serves the stored row, `reportWriteAuthFailure` ignores them, and a `skipCacheOnAuthFailure` loader keeps its cached data. Only `invalid_grant` still means the grant is dead (`tokenProvider.isTotalAuthFailure`). It rules out showing an offline pilot with an expired access token a re-login prompt.

- **`esiFetch` does not gate on `navigator.onLine`.** Browsers report `false` on some VPNs and virtual adapters while ESI is reachable, and a truly offline fetch fails fast anyway. A token refresh that fails with a status-0 `AuthError` is rethrown as `EsiOfflineError`; that is logged as no activity and spends no error budget. `isOfflineFailure` is the shared predicate for "you're offline" copy.

- **`navigator.onLine` and `useOnline()` are advisory only.** They drive UI status, skipping the notification and request-badge polls, and the reconnect trigger (`app/reconnectRecovery.ts`). They never decide whether a request is sent.

- **A sync failure recorded while offline displays as offline until the reconnect sync.** `SyncStatus.offline` is set when the failure happens with the browser offline, and `syncDisplayState` shows `offline` for it even after the browser is back. The reconnect sync replaces it.

- **Reconnect clears only network-caused held failures.** `clearRevalidationFailures` keeps a failure that carries `needsReauth`, so a real 401/403 does not re-fire on every flap of `online`.
