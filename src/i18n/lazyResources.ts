/**
 * Where the build's split-off locale groups (`localeSplit.ts`) register
 * themselves. Each group is a tiny generated module that calls
 * `addLazyResources` as it is evaluated — which can be before `./index.ts` has
 * run `i18n.init()`, when a shell module that imports one is evaluated first.
 * So this holds anything early and hands it over once `index.ts` connects.
 *
 * Imports nothing on purpose: the groups land in route chunks, and must not
 * drag i18next (or anything else) along with them.
 */

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
