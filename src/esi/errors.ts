/**
 * ESI error types, in a module of their own so nothing needs to import the
 * client to throw one.
 *
 * Split out for issue #655: `client.ts` imports the app-wide budget and the
 * budget throws an `EsiError` subclass, which as a cycle would leave
 * `class EsiBudgetError extends EsiError` evaluating against a binding still in
 * its temporal dead zone — an import-order-dependent crash. This file imports
 * nothing, so there is no order to depend on.
 *
 * `client.ts` re-exports all three, which stays their canonical import path for
 * the rest of the app.
 */

export class EsiError extends Error {
  /**
   * The HTTP status ESI answered with, or **0 when there was no response at
   * all** — the request timed out, or the error budget declined to send it.
   * Callers branching on a status are asking "what did ESI say", and the honest
   * answer for those two is "nothing".
   */
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'EsiError';
    this.status = status;
    this.body = body;
  }
}

/** Statuses that shut the circuit: 429 is the rate limit, 420 the legacy error limit. */
export type ThrottleStatus = 420 | 429;

/**
 * Why the app-wide budget declined to send a request: the two limits ESI can
 * shut the door with, and `pacing` for the brake holding a queue back before
 * either has.
 */
export type BudgetRefusal = 'errorLimit' | 'rateLimit' | 'pacing';

/**
 * The refusal the error budget hands back **without making a request**.
 *
 * `status` is 0 rather than 420/429 on purpose. Reporting a status ESI never
 * sent would be a lie in the one field callers read as "what ESI said", and
 * `features/character/typeNames.ts` acts on exactly that field: it answers a
 * 429/420 by fanning out up to a thousand per-id lookups, which is the last
 * thing a spent budget wants. `reason` carries which limit is holding, and
 * `retryAfterMs` how long — richer than a status, and true.
 *
 * Still an `EsiError`, and never 401/403, so `isAuthFailure` stays false and
 * `esi/cache.ts` falls back to the stored row exactly as it does for a 5xx: no
 * re-auth banner, and no change to what a caller receives on success.
 */
export class EsiBudgetError extends EsiError {
  readonly reason: BudgetRefusal;
  /** Milliseconds until the window that is holding this request reopens. */
  readonly retryAfterMs: number;

  constructor(reason: BudgetRefusal, retryAfterMs: number) {
    super(
      0,
      `ESI budget (${reason}) declined to send; retry in ${Math.round(retryAfterMs / 1000)}s`
    );
    this.name = 'EsiBudgetError';
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * A request abandoned because it never answered. Status 0 for the same reason
 * `EsiBudgetError` uses it — ESI said nothing. Distinct from an `AbortError`,
 * which means the *caller* cancelled and is deliberately not worth logging.
 */
export class EsiTimeoutError extends EsiError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(0, `ESI request timed out after ${timeoutMs}ms`);
    this.name = 'EsiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}
