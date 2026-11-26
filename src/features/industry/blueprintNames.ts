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
      namesPromise = null;
      throw error;
    });
  return namesPromise;
}
