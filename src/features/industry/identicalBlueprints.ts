import type { CharacterBlueprint } from '@/esi/endpoints';

export function identicalBlueprintKey(ownerKey: string, blueprint: CharacterBlueprint): string {
  return [
    ownerKey,
    blueprint.type_id,
    blueprint.location_id,
    blueprint.material_efficiency,
    blueprint.time_efficiency,
    blueprint.runs,
  ].join(':');
}

export interface IdenticalGroup<T> {
  first: T;
  members: readonly T[];
}

export function groupIdentical<T>(
  rows: readonly T[],
  keyOf: (row: T) => string
): IdenticalGroup<T>[] {
  const byKey = new Map<string, { first: T; members: T[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = byKey.get(key);
    if (group) group.members.push(row);
    else byKey.set(key, { first: row, members: [row] });
  }
  return [...byKey.values()];
}
