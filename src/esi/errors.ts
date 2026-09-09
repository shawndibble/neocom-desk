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
 * `client.ts` re-exports `EsiError`, which stays its canonical import path for
 * the rest of the app.
 */

export class EsiError extends Error {
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
 * The refusal a shut circuit hands back: the status that shut the door,
 * synthesized without a request ever being made.
 *
 * Deliberately an `EsiError`, and deliberately never 401/403, so `isAuthFailure`
 * stays false and `esi/cache.ts` falls back to the stored row exactly as it does
 * for a 5xx — no re-auth banner, and no change at all to what a caller receives
 * on success. Callers that already branch on `status === 420 || status === 429`
 * (`features/character/typeNames.ts`) see it as the throttle it is.
 */
export class EsiBudgetError extends EsiError {
  /** Milliseconds until the window the server named reopens. */
  readonly retryAfterMs: number;

  constructor(status: ThrottleStatus, retryAfterMs: number) {
    super(
      status,
      `ESI ${status === 420 ? 'error' : 'rate'} budget spent; not sending for ${Math.round(
        retryAfterMs / 1000
      )}s`
    );
    this.name = 'EsiBudgetError';
    this.retryAfterMs = retryAfterMs;
  }
}
