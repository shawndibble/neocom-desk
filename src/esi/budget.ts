/**
 * The app-wide ESI error/rate budget, and the circuit that shuts when it runs
 * out (issue #655, item C).
 *
 * ## Why
 *
 * ESI's legacy **error limit** is 100 non-2xx/3xx responses per minute, counted
 * globally across every route for the whole client — not per endpoint and not
 * per Character. One page's fan-out can therefore throttle the rest of the app:
 * a user on a large corp opened Corp Assets, `GET /universe/structures/{id}`
 * 403'd for ~100 citadels they were not on the ACL of, and ESI then answered
 * **420** to `/mail`, `/contracts`, `/planets`, `/calendar`, `/notifications`
 * and `/industry/jobs` across fifteen unrelated Characters.
 *
 * Before this module `esiFetch` did one thing about that: a single blind retry
 * on 420/429. Nothing read the headers that see it coming, nothing stopped an
 * in-flight fan-out once the door had shut, and `ESI_FANOUT_CONCURRENCY` caps
 * one call site rather than the app.
 *
 * ## The three mechanisms, in the order they engage
 *
 * 1. **A ceiling.** `ESI_MAX_IN_FLIGHT` permits, held across one HTTP request,
 *    shared by every call site. `lib/concurrency.ts`'s per-call-site caps still
 *    apply; this bounds their *sum*.
 * 2. **A brake.** Every response — success, 304 and failure alike — carries
 *    `X-ESI-Error-Limit-Remain`/`-Reset`, and successes carry them too. Once
 *    the remaining budget falls under `ERROR_LIMIT_LOW_WATER`, admissions are
 *    spaced far enough apart that the residual would last to the reset *even if
 *    every remaining request errored*. This is the half that keeps the 420 from
 *    ever happening.
 * 3. **A circuit.** A 420 or 429 shuts the door for the window the server
 *    named. Queued and subsequent callers read that one shared verdict instead
 *    of each firing its own blind retry into a closed door.
 *
 * ## Wait, or fail fast into the cache?
 *
 * Both, split at a bound: **we absorb a hiccup, we do not absorb an outage.**
 * A caller waits up to `MAX_BUDGET_WAIT_MS`; past that the gate refuses with an
 * `EsiBudgetError` that never touches the network, and `esi/cache.ts`'s
 * existing catch serves the stored row. The bound is anchored on
 * `STALE_GRACE_MS` (250ms): past its freshness window the cache layer already
 * substitutes a stale row a quarter-second in and updates in place, so a wait
 * of a second or two is invisible, while a 45-second 420 window is an outage
 * and must be answered from disk immediately. Refusing also costs ESI nothing,
 * so the error budget actually refills instead of being nibbled at by retries.
 *
 * The accepted consequence: a caller with **no** stored row gets
 * `{ cached: null }` — an empty view where it would previously have shown a
 * spinner and then data. That is the right trade (the alternative is a spinner
 * that ends in the same nothing, minutes later, having deepened the outage),
 * but it is a real change and is recorded as one.
 *
 * ## No deadlock
 *
 * The permit is taken at the `esiFetch` leaf, after the token await, and held
 * across exactly one `fetch`. No permit holder ever waits on another permit:
 * `paginated.ts` acquires and releases per page, the 429/420 retry releases
 * before it waits, and `src/auth` reaches SSO, never ESI (verified: no
 * `esiFetch` import there). So the holder set always drains, and nesting
 * `mapWithConcurrencyLimit` — `ownedStockDetection.ts` caps an inner map inside
 * a capped outer one — is safe.
 *
 * Everything above the `--- gate ---` marker is pure and clock-injected, so the
 * policy is unit-tested without timers.
 */
import { createSemaphore, type Release } from '@/lib/concurrency';
import { EsiBudgetError, type ThrottleStatus } from './errors';

/**
 * Requests in flight to ESI across the whole app. Deliberately a little above
 * `ESI_FANOUT_CONCURRENCY` (10): one call site running at its own tuned width
 * must not be slowed by the shared gate, while a boot that stacks the prefetch,
 * a Corp page and a name resolution is held to this instead of their sum.
 */
export const ESI_MAX_IN_FLIGHT = 12;

/**
 * Errors left in the window below which requests start being spaced out. 30 of
 * 100 means 70% of a minute's budget is already spent — a storm, not the
 * handful of 403s and 404s ordinary use produces.
 */
export const ERROR_LIMIT_LOW_WATER = 30;

/** Longest a single admission is ever spaced by, whatever the arithmetic says. */
export const MAX_REQUEST_SPACING_MS = 2000;

/**
 * The bound on every wait this module imposes — the circuit's, the brake's and
 * the queue behind the brake, added together. Past it the gate refuses instead
 * of holding on.
 *
 * Five seconds is where "a hiccup" stops and "an outage" starts, for this app.
 * A brief 429 names a `Retry-After` of a second or three and is worth sitting
 * out once, shared, rather than having every caller retry into it; a 420's
 * `X-ESI-Error-Limit-Reset` runs to a full minute and a rate window can be
 * quarter-hour shaped, neither of which any view should be held for. Past the
 * freshness window `esi/cache.ts` has already substituted the stored row a
 * quarter-second in, so a wait under this bound is invisible on every read but
 * a manual Refresh.
 */
export const MAX_BUDGET_WAIT_MS = 5000;

/** How long a 420 shuts the door for when it names no reset of its own. */
export const DEFAULT_ERROR_WINDOW_MS = 60_000;

/** How long a 429 shuts the door for when it names neither Retry-After nor a rate reset. */
export const DEFAULT_RATE_WINDOW_MS = 1000;

/** Ceiling on a server-named reset, so one absurd header cannot wedge the app for a day. */
export const MAX_CIRCUIT_MS = 5 * 60_000;

export type { ThrottleStatus } from './errors';
export { EsiBudgetError } from './errors';

export interface BudgetState {
  /** `X-ESI-Error-Limit-Remain` as last seen, or null if never seen. */
  readonly errorRemain: number | null;
  /** When the error window the above belongs to rolls over (epoch ms). */
  readonly errorResetAt: number | null;
  /** `X-Ratelimit-Remaining` as last seen. */
  readonly rateRemain: number | null;
  /** When that rate window rolls over (epoch ms). */
  readonly rateResetAt: number | null;
  /** Epoch ms the circuit reopens, or null when it is not shut. */
  readonly circuitUntil: number | null;
  /** Which status shut it — reported back to callers so the refusal is honest. */
  readonly circuitStatus: ThrottleStatus | null;
  /**
   * Earliest instant the next request may be admitted. Only moves ahead of
   * `now` while the brake is on; it is what turns a per-request spacing into an
   * actual queue rather than N callers all sleeping the same interval and then
   * firing together.
   */
  readonly nextAdmissionAt: number;
}

export const INITIAL_BUDGET: BudgetState = {
  errorRemain: null,
  errorResetAt: null,
  rateRemain: null,
  rateResetAt: null,
  circuitUntil: null,
  circuitStatus: null,
  nextAdmissionAt: 0,
};

export interface ObservedResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly now: number;
}

/** Header value as a finite, non-negative number, or null when absent/garbage. */
function numericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A server-named "seconds until reset" as an absolute instant, clamped. */
function resetInstant(seconds: number | null, now: number): number | null {
  if (seconds === null) return null;
  return now + Math.min(seconds * 1000, MAX_CIRCUIT_MS);
}

/**
 * Fold one response's headers into the budget. Called for **every** response —
 * a 200 and a 304 carry the error-limit headers just as a failure does, and
 * reading them only on failure is what makes a client blind until it is too
 * late.
 */
export function observeBudget(state: BudgetState, response: ObservedResponse): BudgetState {
  const { status, headers, now } = response;

  const errorRemain = numericHeader(headers, 'x-esi-error-limit-remain');
  const errorResetAt = resetInstant(numericHeader(headers, 'x-esi-error-limit-reset'), now);
  const rateRemain = numericHeader(headers, 'x-ratelimit-remaining');
  const rateResetAt = resetInstant(numericHeader(headers, 'x-ratelimit-reset'), now);

  let next: BudgetState = {
    ...state,
    // A header ESI did not send this time leaves the last reading standing;
    // `remainingIn` below is what stops a lapsed one being believed.
    errorRemain: errorRemain ?? state.errorRemain,
    errorResetAt: errorResetAt ?? state.errorResetAt,
    rateRemain: rateRemain ?? state.rateRemain,
    rateResetAt: rateResetAt ?? state.rateResetAt,
  };

  if (status === 420) {
    next = {
      ...next,
      circuitUntil: errorResetAt ?? now + DEFAULT_ERROR_WINDOW_MS,
      circuitStatus: 420,
    };
  } else if (status === 429) {
    const retryAfter = resetInstant(numericHeader(headers, 'retry-after'), now);
    next = {
      ...next,
      circuitUntil: retryAfter ?? rateResetAt ?? now + DEFAULT_RATE_WINDOW_MS,
      circuitStatus: 429,
    };
  } else if (status < 400) {
    // ESI discards every request while the error limit is spent, so an answer
    // it actually served is proof the window is over. Reopening on it beats
    // sitting out a reset the server has already moved past. A 4xx/5xx proves
    // nothing of the sort — it is exactly what the budget is counting.
    next = { ...next, circuitUntil: null, circuitStatus: null };
  }

  return next;
}

/** What the gate has decided about one request. */
export type RequestPlan =
  /** Go ahead, after waiting `waitMs` (0 on a healthy budget). Never above the bound. */
  | { readonly kind: 'go'; readonly waitMs: number }
  /** Do not go at all: the wait would exceed the bound. */
  | { readonly kind: 'refuse'; readonly status: ThrottleStatus; readonly retryAfterMs: number };

/**
 * How far apart admissions must be for one budget's remainder to last until its
 * reset, on the worst-case assumption that every one of them errors.
 *
 * Zero while the budget is comfortable, or while the reading is not about now:
 * a `remain` whose own window has already rolled over says nothing about the
 * one we are in.
 */
function brakeMs(remain: number | null, resetAt: number | null, now: number): number {
  if (remain === null || resetAt === null || resetAt <= now) return 0;
  if (remain > ERROR_LIMIT_LOW_WATER) return 0;
  return Math.min((resetAt - now) / Math.max(remain, 1), MAX_REQUEST_SPACING_MS);
}

/** The stronger of the two brakes — the error budget's and the rate limit's. */
function spacingMs(state: BudgetState, now: number): number {
  return Math.max(
    brakeMs(state.errorRemain, state.errorResetAt, now),
    brakeMs(state.rateRemain, state.rateResetAt, now)
  );
}

/**
 * How far ahead of `now` a stored instant can legitimately sit. Every one of
 * them is `some earlier now + a bounded offset`, so anything beyond this is not
 * a long wait — it is a wall clock that moved backwards (NTP, a laptop waking,
 * a user changing the time), and believing it would wedge the app for as long
 * as the jump. Discarded rather than obeyed.
 */
const CLOCK_JUMP_HORIZON_MS = MAX_CIRCUIT_MS + MAX_BUDGET_WAIT_MS + MAX_REQUEST_SPACING_MS;

/** A stored instant, or `now` when it is too far ahead to be anything but a clock jump. */
function believable(instant: number, now: number): number {
  return instant - now > CLOCK_JUMP_HORIZON_MS ? now : instant;
}

/**
 * Decide — purely — whether this request may go, and reserve its slot.
 *
 * The circuit, the brake and the queue behind the brake collapse into one
 * instant: the earliest moment this request may fire. If that is inside
 * `MAX_BUDGET_WAIT_MS` the caller waits for it; if not, the caller is refused
 * and falls back to the cache. Callers must sleep the returned `waitMs` once
 * and then proceed — re-planning after the sleep would re-read a clock the
 * caller has already paid for.
 */
export function planRequest(
  state: BudgetState,
  now: number
): { readonly plan: RequestPlan; readonly state: BudgetState } {
  const shutUntil =
    state.circuitUntil !== null && state.circuitUntil > now
      ? believable(state.circuitUntil, now)
      : 0;
  const earliest = Math.max(now, shutUntil, believable(state.nextAdmissionAt, now));
  const waitMs = earliest - now;

  if (waitMs > MAX_BUDGET_WAIT_MS) {
    return {
      plan: {
        kind: 'refuse',
        status: state.circuitStatus ?? 420,
        retryAfterMs: waitMs,
      },
      // No slot is reserved for a request that is not going to be made, so a
      // refusal never pushes the queue further out for the caller behind it.
      state,
    };
  }

  return {
    plan: { kind: 'go', waitMs },
    state: { ...state, nextAdmissionAt: earliest + spacingMs(state, now) },
  };
}

// --- gate ------------------------------------------------------------------
// Everything below owns the singleton, the clock and the timers.

let budget: BudgetState = INITIAL_BUDGET;
let semaphore = createSemaphore(ESI_MAX_IN_FLIGHT);

/** Fold a real response into the app-wide budget. */
export function observeEsiResponse(status: number, headers: Headers): void {
  budget = observeBudget(budget, { status, headers, now: Date.now() });
}

/** The budget as it stands. Diagnostics and tests only — never a control flow input. */
export function esiBudgetSnapshot(): BudgetState {
  return budget;
}

/** ESI requests in flight app-wide. Diagnostics and tests only. */
export function esiInFlight(): number {
  return semaphore.inFlight;
}

/**
 * Test seam. Module state outlives a `beforeEach`, so a suite that deliberately
 * serves a 420 would otherwise shut the circuit for every test after it.
 */
export function resetEsiBudget(): void {
  budget = INITIAL_BUDGET;
  semaphore = createSemaphore(ESI_MAX_IN_FLIGHT);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/**
 * Pass the gate for one ESI request. Resolves with the release function that
 * gives the in-flight permit back — call it in a `finally`, and call it
 * *before* any retry backoff, so a waiting retry does not hold the ceiling shut
 * behind it.
 *
 * Rejects with `EsiBudgetError` when the budget is spent for longer than the
 * bounded wait, and with the signal's reason if the caller aborts.
 */
export async function passEsiGate(signal?: AbortSignal): Promise<Release> {
  const { plan, state } = planRequest(budget, Date.now());
  budget = state;
  if (plan.kind === 'refuse') throw new EsiBudgetError(plan.status, plan.retryAfterMs);
  // Waited once, then acted on. Re-planning here would loop under a clock the
  // caller cannot advance (and, in tests, one that does not move at all).
  await sleep(plan.waitMs, signal);
  return semaphore.acquire(signal);
}
