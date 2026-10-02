/**
 * Folding identical blueprint copies into one phone card. Two BPCs of the
 * same print, owned by the same pilot, sitting in the same place with the
 * same research and runs left price identically and act identically, so the
 * phone lists show them once with a count. Anything that tells them apart
 * (location, ME/TE, runs, owner) keeps them as separate cards.
 */
import type { CharacterBlueprint } from '@/esi/endpoints';

/** `ownerKey` is the caller's own owner identity (a Character id, or corp). */
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
  /** The row the card renders from — the group's first in input order. */
  first: T;
  /** Every row in the group, `first` included, in input order. */
  members: readonly T[];
}

/** Groups in the order each key first appears, so a sorted input stays sorted. */
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
