import { getServiceWorkerRegistration } from '@/lib/serviceWorker';
import type { AppNotificationOptions } from './notificationOptions';

export interface PageDisplayEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  construct: ((title: string, options: AppNotificationOptions) => void) | undefined;
}

export function livePageDisplayEnv(): PageDisplayEnv {
  return {
    getRegistration: getServiceWorkerRegistration,
    construct:
      typeof Notification === 'undefined'
        ? undefined
        : (title, options) => {
            new Notification(title, options);
          },
  };
}

export async function displayPageNotification(
  env: PageDisplayEnv,
  title: string,
  options: AppNotificationOptions
): Promise<void> {
  try {
    const registration = await env.getRegistration();
    if (registration && typeof registration.showNotification === 'function') {
      await registration.showNotification(title, options);
      return;
    }
  } catch {}

  if (!env.construct) return;
  try {
    env.construct(title, options);
  } catch {}
}
