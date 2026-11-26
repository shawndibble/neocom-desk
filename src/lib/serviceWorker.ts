export function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  return container ? container.getRegistration() : Promise.resolve(undefined);
}
