export interface IdleHost {
  readyState?: string;
  addLoadListener(listener: () => void): void;
  requestIdle(callback: () => void, timeoutMs: number): void;
}

export const IDLE_TIMEOUT_MS = 3000;

export function waitForIdle(host: IdleHost | undefined): Promise<void> {
  if (!host) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const idle = () => host.requestIdle(resolve, IDLE_TIMEOUT_MS);
    if (host.readyState === 'complete') idle();
    else host.addLoadListener(idle);
  });
}

function browserHost(): IdleHost | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  return {
    readyState: document.readyState,
    addLoadListener: (listener) => window.addEventListener('load', listener, { once: true }),
    requestIdle: (callback, timeoutMs) => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(callback, { timeout: timeoutMs });
      } else {
        window.setTimeout(callback, 1);
      }
    },
  };
}

let pageIdle: Promise<void> | undefined;

export function whenPageIdle(): Promise<void> {
  pageIdle ??= waitForIdle(browserHost());
  return pageIdle;
}
