export type LocaleResources = Record<string, unknown>;

let sink: ((resources: LocaleResources) => void) | null = null;
const pending: LocaleResources[] = [];

export function addLazyResources(resources: LocaleResources): void {
  if (sink) sink(resources);
  else pending.push(resources);
}

export function connectLazyResources(add: (resources: LocaleResources) => void): void {
  sink = add;
  for (const resources of pending.splice(0)) add(resources);
}
