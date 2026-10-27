/**
 * Every blueprint-like name in the SDE, lower-cased — what the paste router
 * checks a pasted list against (`engine/import/blueprintList.ts`).
 *
 * Wider than the buildable catalog on purpose: an invention, research or
 * copying-only blueprint is still a blueprint, so a list full of them is
 * recognised and then reported as skipped rather than appraised.
 */
import { loadBlueprints, loadTypes } from '@/sde/loadSde';
import type { BlueprintMap, TypeMap } from '@/sde/types';

export function blueprintNamesFrom(types: TypeMap, blueprints: BlueprintMap): Set<string> {
  const names = new Set<string>();
  for (const id in types) {
    const lower = types[id].name.toLowerCase();
    if (lower.endsWith(' blueprint') || lower.endsWith(' reaction formula')) names.add(lower);
  }
  for (const id in blueprints) names.add(blueprints[id].name.toLowerCase());
  return names;
}

let namesPromise: Promise<ReadonlySet<string>> | null = null;

export function loadBlueprintNames(): Promise<ReadonlySet<string>> {
  namesPromise ??= Promise.all([loadTypes(), loadBlueprints()])
    .then(([types, blueprints]) => blueprintNamesFrom(types, blueprints))
    .catch((error: unknown) => {
      namesPromise = null; // allow retry after failure
      throw error;
    });
  return namesPromise;
}
