/**
 * ESI's `reason` on a bounty-prize journal line is not prose: it is the NPC
 * kills the payout covers, as comma-separated `typeID: count` pairs (e.g.
 * `"17039: 2,2072: 1"`). Parsed here so the journal can name the rats instead
 * of printing the ids.
 */
export interface BountyKill {
  typeId: number;
  count: number;
}

const PAIR = /^(\d+):\s*(\d+)$/;

/** The kills in a bounty `reason`, most killed first — or null when it isn't a kill list. */
export function parseBountyKills(reason: string | undefined): BountyKill[] | null {
  if (!reason) return null;
  const counts = new Map<number, number>();
  for (const part of reason.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const match = PAIR.exec(trimmed);
    if (!match) return null;
    const typeId = Number(match[1]);
    counts.set(typeId, (counts.get(typeId) ?? 0) + Number(match[2]));
  }
  if (counts.size === 0) return null;
  return [...counts]
    .map(([typeId, count]) => ({ typeId, count }))
    .sort((a, b) => b.count - a.count || a.typeId - b.typeId);
}

/**
 * EVE carries no faction on an NPC type; its item Group's name does ("Deadspace
 * Blood Raiders Battleship", "Asteroid Guristas Frigate"). First match wins,
 * in this order; the display names are CCP's own proper nouns.
 */
const PIRATE_FACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bAngel\b/, 'Angel Cartel'],
  [/\bBlood Raider/, 'Blood Raiders'],
  [/\bGuristas\b/, 'Guristas'],
  [/\bSansha/, "Sansha's Nation"],
  [/\bSerpentis\b/, 'Serpentis'],
  [/\bRogue Drone/, 'Rogue Drones'],
  [/\bMordu/, "Mordu's Legion"],
  [/\bMercenar/, 'Mercenaries'],
  [/\bTriglavian/, 'Triglavian Collective'],
  [/\bDrifter/, 'Drifters'],
  [/\bSleeper/, 'Sleepers'],
  [/\bEDENCOM\b/, 'EDENCOM'],
];

/** The pirate faction an NPC's item Group name names, or null (sentry guns, structures). */
export function pirateFactionOf(groupName: string): string | null {
  for (const [pattern, faction] of PIRATE_FACTIONS) if (pattern.test(groupName)) return faction;
  return null;
}

export interface FactionKills {
  /** Null collects kills with no faction, or whose faction couldn't be resolved. */
  faction: string | null;
  count: number;
}

/** Kills summed per faction, largest first; the null bucket always last, and only when non-empty. */
export function killsByFaction(
  kills: readonly BountyKill[],
  factions: ReadonlyMap<number, string | null>
): FactionKills[] {
  const counts = new Map<string, number>();
  let other = 0;
  for (const { typeId, count } of kills) {
    const faction = factions.get(typeId) ?? null;
    if (faction === null) other += count;
    else counts.set(faction, (counts.get(faction) ?? 0) + count);
  }
  const grouped: FactionKills[] = [...counts]
    .map(([faction, count]) => ({ faction, count }))
    .sort((a, b) => b.count - a.count || a.faction.localeCompare(b.faction));
  if (other > 0) grouped.push({ faction: null, count: other });
  return grouped;
}
