/**
 * What happens when a fired notification is tapped (issue: PWA notification
 * best practices). Without this the app registered no `notificationclick`
 * listener at all, so tapping a "your wallet changed" alert did nothing — it
 * told the user something happened and then stranded them.
 *
 * Extracted from `src/sw.ts` for the same reason `pushHandler.ts` was: ADR
 * 0007's carve-out makes the Service Worker file orchestration-only and
 * untested, so anything with a decision in it lives here instead.
 *
 * The rule is focus-then-navigate, not open-a-second-window: a PWA that opens
 * a fresh window per notification while one is already on screen is the
 * classic complaint about web push. Only when nothing of ours is open does a
 * window get opened.
 */

import { NOTIFICATION_FALLBACK_ROUTE } from './notificationOptions';

/**
 * The `data` a notification was fired with, narrowed to the route to open.
 * Lives here rather than inline in `sw.ts` so the malformed cases are
 * testable: a notification fired by an older build carries no `data` at all,
 * and one is not worth dropping the click for.
 */
export function urlFromNotificationData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return NOTIFICATION_FALLBACK_ROUTE;
  const url = (data as { url?: unknown }).url;
  return typeof url === 'string' && url.length > 0 ? url : NOTIFICATION_FALLBACK_ROUTE;
}

/** The slice of `WindowClient` this needs; `navigate` is optional because not every browser exposes it. */
export interface WindowClientLike {
  url: string;
  focus: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
}

export interface NotificationClickEnv {
  matchAll: () => Promise<readonly WindowClientLike[]>;
  openWindow: (url: string) => Promise<unknown>;
  /** The worker's own origin; clients on any other origin are not ours to focus. */
  origin: string;
}

/** Same-origin and already pointing at the requested path (and query) — nothing to navigate. */
function isAlreadyThere(clientUrl: string, url: string, origin: string): boolean {
  try {
    const parsed = new URL(clientUrl);
    return parsed.origin === origin && parsed.pathname + parsed.search === url;
  } catch {
    return false;
  }
}

function isOurs(clientUrl: string, origin: string): boolean {
  try {
    return new URL(clientUrl).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Never rejects: a click handler that throws leaves the notification dismissed
 * with nothing having happened, which is worse than landing on the wrong page.
 */
export async function handleNotificationClick(
  env: NotificationClickEnv,
  url: string
): Promise<void> {
  try {
    const clients = await env.matchAll();
    const existing = clients.find((client) => isOurs(client.url, env.origin));

    if (!existing) {
      await env.openWindow(url);
      return;
    }

    // Focus first, then move it: focusing after a navigate can lose the
    // gesture attribution some browsers require to raise the window.
    await existing.focus();
    if (!isAlreadyThere(existing.url, url, env.origin) && existing.navigate) {
      await existing.navigate(url);
    }
  } catch {
    // See doc comment above.
  }
}
