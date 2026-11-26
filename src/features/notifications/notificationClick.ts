import { NOTIFICATION_FALLBACK_ROUTE } from './notificationOptions';

export function urlFromNotificationData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return NOTIFICATION_FALLBACK_ROUTE;
  const url = (data as { url?: unknown }).url;
  return typeof url === 'string' && url.length > 0 ? url : NOTIFICATION_FALLBACK_ROUTE;
}

export interface WindowClientLike {
  url: string;
  focus: () => Promise<unknown>;
  navigate?: (url: string) => Promise<unknown>;
}

export interface NotificationClickEnv {
  matchAll: () => Promise<readonly WindowClientLike[]>;
  openWindow: (url: string) => Promise<unknown>;
  origin: string;
}

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

    await existing.focus();
    if (!isAlreadyThere(existing.url, url, env.origin) && existing.navigate) {
      await existing.navigate(url);
    }
  } catch {}
}
