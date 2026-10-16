/**
 * Resolves once the page has finished loading and the browser is idle, so
 * gtag.js (the largest script on the landing page) never competes with the
 * app's own bundle on the critical path. Every caller shares one promise:
 * page views fired before it settles simply wait on it, then send in order.
 */
export interface IdleHost {
  readyState?: string;
  addLoadListener(listener: () => void): void;
  requestIdle(callback: () => void, timeoutMs: number): void;
}

/** Upper bound on the idle wait, for browsers that never report idle. */
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
