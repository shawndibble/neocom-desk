# Scope decisions — one app-wide ESI error budget, with a circuit that fails fast into the cache (issue #655)

_Recorded 2026-09-09 · issue #655._

- **The throttling policy is app-wide, and it lives at `esiFetch`.** ESI's
  legacy error limit is 100 non-2xx/3xx responses per 60 seconds counted
  **globally across every route** for the whole client — not per endpoint, not
  per Character. A policy expressed anywhere but the one function every ESI call
  passes through is therefore expressed in the wrong unit. `src/esi/budget.ts`
  is that policy: `esiFetch` admits each request through its gate, feeds every
  response back to it, and holds one of its permits for the length of the
  request. No call site opts in, and no call site can opt out.

- **The headers are read off every response, not only off failures.** ESI
  returns `X-ESI-Error-Limit-Remain`/`-Reset` on successes and 304s as well, and
  reading them only when something has already gone wrong is what leaves a
  client blind until it is too late. This is the half of the fix that stops the
  420 happening at all, rather than reacting to one.

- **Three mechanisms, engaging in order: a ceiling, a brake, a circuit.**
  `ESI_MAX_IN_FLIGHT` (12) bounds the _sum_ of the per-call-site fan-outs that
  `lib/concurrency.ts` caps individually — the boot prefetch, the Corp page's
  parallel loads, `typeNames.ts` and the per-character asset reads used to stack
  at 10 apiece with nothing counting the total. Under
  `ERROR_LIMIT_LOW_WATER` (30 of 100) admissions are spaced far enough apart
  that the residual budget would last to the reset **even if every remaining
  request errored**. A 420 or 429 shuts the circuit for the window the server
  named, so queued and later callers read one shared verdict instead of each
  firing its own blind retry into a closed door.

- **A shut circuit fails fast into the cache; a brief one is waited out. We
  absorb a hiccup, we do not absorb an outage.** Every **policy** wait —
  circuit, brake, and the queue behind the brake — is bounded by
  `MAX_BUDGET_WAIT_MS` (5s); past it the gate refuses with an `EsiBudgetError`
  that never touches the network. The bound is anchored on `STALE_GRACE_MS`
  (250ms): past its freshness window `esi/cache.ts` already substitutes the
  stored row a quarter-second in and updates the view in place, so a wait under
  the bound is invisible on every read but a manual Refresh, while a 420's
  minute-long reset — or a quarter-hour rate window — is an outage and must be
  answered from disk immediately. Refusing also costs ESI nothing, so the error
  budget actually refills instead of being nibbled at by retries.

  Rejected: **waiting unconditionally.** A 60-second reset across a fan-out is a
  page that spins for a minute and then thunders back all at once. Rejected too:
  **failing fast always.** A `Retry-After: 2` is worth sitting out once, shared,
  and the app would otherwise drop a whole boot prefetch over a two-second
  hiccup.

- **Queueing for one of the ceiling's permits is throughput, not policy, so it
  is not _refused_ up front — but it is still bounded.** Refusing it would drop
  a boot prefetch merely because the app is busy on a slow connection, and the
  same queue already existed inside every `mapWithConcurrencyLimit`; the ceiling
  only moved it somewhere it can be seen. `client.ts` passes its per-call
  request scope into the gate, so a caller queued past `REQUEST_TIMEOUT_MS` is
  aborted there with an `EsiTimeoutError` instead of waiting forever. Nothing in
  the module waits without an end. Meanwhile `esi/cache.ts`'s 250ms grace has
  already put rows on screen, so a queued request is not a spinner.

- **`REQUEST_TIMEOUT_MS` is one clock for the whole call — gate wait, permit
  queue, fetch and body read — not just for the connection.** Two clocks (a
  queue deadline plus a fetch deadline) was the alternative, and it was rejected
  for a reason that is load-bearing rather than aesthetic: the access token is
  fetched _before_ the gate, and `auth/session.ts`'s `getValidAccessToken` only
  guarantees it good for `EXPIRY_BUFFER_MS` (60s) from that moment. A single
  bound at half of that makes it impossible for a request that queued behind a
  fan-out to go out with an expired token — which would 401, and a 401 paints
  the shell-wide re-auth banner over what is really congestion. Split the clock
  and the total becomes unbounded again, and the banner becomes reachable.
  `budget.test.ts` pins the relationship so raising the timeout past the buffer
  fails rather than quietly reintroducing it.

  The accepted consequence: a request that spent most of its 30s queued gets a
  short fetch window, so the tail of a very deep backlog fails into the cache
  rather than merely finishing late. That is the intended trade — a backlog that
  cannot drain inside 30 seconds is one the app should stop growing, and the
  cache-first read path already has rows on screen for it.

- **The accepted consequence: a caller with no stored row now gets an empty
  view where it previously got a spinner and then data.** `esi/cache.ts` returns
  `{ cached: null }` when the live call fails and nothing is on disk. That is
  the right trade — the alternative is a spinner that ends in the same nothing,
  minutes later, having deepened the outage by spending more of the budget — but
  it is a real change in what a first-ever visit looks like during a throttle,
  and it is recorded as one rather than left to be discovered.

- **A refusal reports `status: 0`, not 420 or 429 — nothing was sent, so ESI
  said nothing.** It is still an `EsiError` and still never 401/403, so
  `isAuthFailure` stays false, no re-auth banner is painted, the read-through
  cache falls back exactly as it does for a 5xx, and what a caller receives on
  success is unchanged. But it must not borrow a status ESI never returned:
  `status` is the one field callers read as "what did ESI say", and
  `features/character/typeNames.ts` acts on precisely that — it answers a
  429/420 by fanning out up to a thousand per-id lookups, which is the last
  thing a spent budget wants (that amplifier is item D's own subject).
  `EsiBudgetError` carries `reason` (`errorLimit` / `rateLimit` / `pacing`) and
  `retryAfterMs` instead: richer than a status, and true. A queue held back by
  the brake reports `pacing`, because no circuit shut and claiming one would be
  a story about a 420 that never happened. The same reasoning gives a timed-out
  request `status: 0` via `EsiTimeoutError`.

- **A refusal is not logged as ESI activity.** No route was called, so there is
  nothing to show — the same reasoning that already exempts a cancelled load.
  Logging it would fill `/settings`' activity list with errors during a
  throttle, for zero traffic.

- **The circuit reopens on a 2xx/3xx, but only from a request that started after
  it shut.** ESI discards every request while the error limit is spent, so a
  response it actually served is proof the window is over, and sitting out a
  reset the server has already moved past is pure cost. The qualifier is the
  whole point though: up to `ESI_MAX_IN_FLIGHT - 1` peers were already on the
  wire when the 420 landed, and one of them answering 200 says only that ESI was
  fine when _it_ was sent — a moment the 420 has since contradicted. Without the
  start-time check the circuit is reopened by its own stragglers, immediately,
  in exactly the storm it exists for.

- **The brake trickles, it never clamps to zero.** This matters because PR
  #653's `structures.ts` memoizes a forbidden citadel only on a _real_ 403 — a
  request the gate refuses teaches it nothing. Under the brake, requests are
  spread out, not stopped: a caller arriving after the last admission's spacing
  has elapsed is admitted with no wait at all. So each page load still spends
  most of a fresh 100-error window on real 403s and memoizes them, and the memo
  converges over a small number of visits instead of being starved.

- **One existing behaviour changed deliberately: the blind 10-second retry is
  gone.** `esiFetch` used to sleep up to 10s on any 429/420 and retry once,
  whatever the server said. The retry survives, but it is now the gate's
  decision rather than a private sleep — it re-enters the gate, which waits out
  a short reset and refuses a long one. `client.test.ts`'s "caps the retry wait
  at 10 seconds" is replaced by "does not retry a wait longer than the bound",
  which asserts the new rule: a `Retry-After: 60` is not slept on, is not
  retried, and spends nothing further against the budget.

- **`esiFetch` gets a 30-second request timeout, because the ceiling made one
  hung socket everybody's problem.** With no ceiling, a hung request stalled
  only its own call site; holding one of twelve app-wide permits, twelve of them
  would be the whole ESI layer. It is the "this call is dead" bound, not a
  latency target — `esi/cache.ts`'s 250ms grace race remains the answer to a
  merely slow call. It also spans the body read, not just the headers: `fetch`
  ties the response stream to the signal it was given, so a scope ending at the
  headers would have left `response.json()` on a slow body uncancellable, which
  the caller's own `AbortSignal` never was.

- **The gate is entered at the leaf, and only at the leaf.** The permit is taken
  inside `esiFetch` after the token await and held across exactly one `fetch`;
  the 429/420 retry releases before it waits. No permit holder ever waits on
  another permit — `paginated.ts` acquires per page, and `src/auth` reaches SSO
  rather than ESI — so nesting `mapWithConcurrencyLimit` (as
  `ownedStockDetection.ts` does) cannot deadlock against the ceiling. Wrapping
  the gate around a fan-out instead of around a request would deadlock, and is
  the thing not to do here.

- **`ESI_FANOUT_CONCURRENCY` and `mapWithConcurrencyLimit` keep their names and
  signatures.** A dozen modules import them; the change is additive
  (`createSemaphore`) plus a comment saying what they are not — a cap per call
  site, whose sum is now bounded elsewhere.

- **No ADR.** It would be a numbered file, and `CLAUDE.md` forbids working out
  "the next" number for anything, precisely because parallel agents all claim
  the same one. The reasoning above is the record; `docs/ARCHITECTURE.md`'s
  `src/esi` row carries the map.
