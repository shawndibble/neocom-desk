/**
 * `fetch` with a deadline. Under lie-fi (the radio says connected, nothing
 * answers) a bare `fetch` never settles, so a page waiting on it spins
 * forever; with a deadline it rejects with a `TimeoutError` into the caller's
 * existing failure path.
 *
 * The deadline covers the whole exchange, body included, as
 * `AbortSignal.timeout` does. It is a plain timer rather than that API so
 * fake timers can drive it in tests. For downloads that may legitimately take
 * long (the SDE data files), see `idleTimeout.ts`.
 */

/** Default window for a small JSON API call. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: Omit<RequestInit, 'signal'> = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
  }, timeoutMs);
  // A response that arrives leaves its body to the caller, so the deadline keeps
  // running for it; only a request that already failed has nothing left to time.
  return fetch(input, { ...init, signal: controller.signal }).catch((error: unknown) => {
    clearTimeout(timer);
    throw error;
  });
}
