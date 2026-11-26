export const IDLE_TIMEOUT_MS = 20_000;

const NO_STREAM_TIMEOUT_MS = 45_000;

export interface IdleGuard {
  signal: AbortSignal;
  arm: (ms?: number) => void;
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

export async function fetchJsonWithIdleTimeout<T>(url: string, label: string): Promise<T> {
  const { ok, status, bytes } = await fetchWithIdleTimeout(url);
  if (!ok) throw new Error(`Failed to load ${label}: HTTP ${status}`);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
