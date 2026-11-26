import { isInstalledApp } from '@/lib/installedApp';

export type WebPushSupport = 'unsupported' | 'requires-install' | 'supported';

function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export function webPushSupport(): WebPushSupport {
  if (isIos() && !isInstalledApp()) return 'requires-install';
  if (typeof Notification === 'undefined' || !navigator.serviceWorker) return 'unsupported';
  return 'supported';
}
