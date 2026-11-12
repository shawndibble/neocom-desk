import type { WarAgainstMe, WarEntityIds } from '@/engine/wars';

export interface WarGroup {
  against: WarEntityIds;
  wars: WarAgainstMe[];
}

/**
 * The wars split by the account corporation each is against, in list order
 * (the active Character's corporation first, as `warsAgainst` sorts it).
 */
export function corporationsAtWar(wars: readonly WarAgainstMe[]): WarGroup[] {
  const groups = new Map<number | undefined, WarGroup>();
  for (const hit of wars) {
    const key = hit.against.corporationId;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { against: hit.against, wars: [hit] });
    else group.wars.push(hit);
  }
  return [...groups.values()];
}
