import type { WarAgainstMe, WarEntityIds } from '@/engine/wars';

export interface WarGroup {
  against: WarEntityIds;
  wars: WarAgainstMe[];
}

export function groupWarsByCorporation(wars: readonly WarAgainstMe[]): WarGroup[] {
  const groups = new Map<number | undefined, WarGroup>();
  for (const hit of wars) {
    const key = hit.against.corporationId;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { against: hit.against, wars: [hit] });
    else group.wars.push(hit);
  }
  return [...groups.values()];
}
