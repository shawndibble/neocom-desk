/**
 * Stall ("idle") timeout for downloads of unknown duration. A whole-exchange
 * deadline (`fetchWithTimeout`) suits a small API call, but a 3 MB data file on
 * a slow link legitimately takes longer than any fixed deadline. An idle guard
 * aborts only when nothing arrives — no response, no bytes — for `idleMs`, and
 * is re-armed by every chunk, so a slow link that keeps moving is left alone
 * and a hung one rejects into the caller's failure path.
 */

/** How long a download may go without receiving a byte before it is given up on. */
export const IDLE_TIMEOUT_MS = 20_000;

/** Whole-body deadline for the rare runtime with no streaming `Response.body`. */
const NO_STREAM_TIMEOUT_MS = 45_000;

export interface IdleGuard {
  /** Pass to `fetch`; aborts with a `TimeoutError` once the guard has been idle too long. */
  signal: AbortSignal;
  /** (Re)starts the idle clock; `ms` overrides the window for this arming. */
  arm: (ms?: number) => void;
  /** Stops the clock. Call when the download is over, however it ended. */
  clear: () => void;
}

export function createIdleGuard(idleMs: number = IDLE_TIMEOUT_MS): IdleGuard {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    signal: controller.signal,
    arm: (ms = idleMs) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort(new DOMException('The download stalled.', 'TimeoutError'));
      }, ms);
    },
    clear: () => clearTimeout(timer),
  };
}

/**
 * Reads a response body to the end, re-arming `guard` on every chunk.
 * `onChunk` gets the running byte count. Without a streaming body it falls
 * back to one `arrayBuffer()` read under a plain deadline.
 */
export async function readBodyWithGuard(
  response: Response,
  guard: IdleGuard,
  onChunk?: (loadedBytes: number) => void
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    guard.arm(NO_STREAM_TIMEOUT_MS);
    return new Uint8Array(await response.arrayBuffer());
  }
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    guard.arm();
    chunks.push(value);
    loadedBytes += value.byteLength;
    onChunk?.(loadedBytes);
  }
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Reads a response body to the end under `guard` and keeps nothing: for a
 * download whose point is the side effect (a service worker or Cache Storage
 * writing it), where holding a copy of a multi-MB file would be waste.
 */
export async function drainBodyWithGuard(response: Response, guard: IdleGuard): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    guard.arm(NO_STREAM_TIMEOUT_MS);
    await response.arrayBuffer();
    return;
  }
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
    guard.arm();
  }
}

/**
 * Fetches `url` and reads its body under an idle guard. The body is read only
 * for a 2xx answer (an error page is not worth waiting on; it is cancelled).
 * With `drain`, the body is read and discarded and `bytes` is empty.
 */
export async function fetchWithIdleTimeout(
  url: string,
  options: { drain?: boolean } = {}
): Promise<{ ok: boolean; status: number; bytes: Uint8Array }> {
  const guard = createIdleGuard();
  try {
    guard.arm();
    const response = await fetch(url, { signal: guard.signal });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return { ok: false, status: response.status, bytes: new Uint8Array() };
    }
    if (options.drain) {
      await drainBodyWithGuard(response, guard);
      return { ok: true, status: response.status, bytes: new Uint8Array() };
    }
    return { ok: true, status: response.status, bytes: await readBodyWithGuard(response, guard) };
  } finally {
    guard.clear();
  }
}

/** `fetchWithIdleTimeout`, parsed as JSON; throws `Failed to load <label>: HTTP <status>` otherwise. */
export async function fetchJsonWithIdleTimeout<T>(url: string, label: string): Promise<T> {
  const { ok, status, bytes } = await fetchWithIdleTimeout(url);
  if (!ok) throw new Error(`Failed to load ${label}: HTTP ${status}`);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
