/**
 * The page's own service-worker registration, or `undefined` where there is
 * no worker — a browser without the API, SSR/test environments, and a page
 * whose worker has not registered yet (dev server, first load).
 *
 * `getRegistration()` rather than `serviceWorker.ready`: `ready` never settles
 * when nothing is registered, and both callers run somewhere a hang is the
 * failure they are guarding against.
 */
export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  return container ? container.getRegistration() : Promise.resolve(undefined);
}
