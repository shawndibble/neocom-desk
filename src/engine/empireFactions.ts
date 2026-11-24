/**
 * The four empire factions and their ids, as the SDE and ESI name a faction
 * (`factionId` on a Military Campaign, a hub's owner, a ship's race). One
 * table, so no surface hand-writes the ids again.
 */
export const EMPIRE_FACTION_IDS = {
  amarr: 500003,
  caldari: 500001,
  gallente: 500004,
  minmatar: 500002,
} as const;

export type EmpireFaction = keyof typeof EMPIRE_FACTION_IDS;

const BY_ID = new Map(
  (Object.entries(EMPIRE_FACTION_IDS) as [EmpireFaction, number][]).map(([faction, id]) => [
    id,
    faction,
  ])
);

/** The empire faction a faction id is, or null for any other faction (or none). */
export function empireFactionOf(factionId: number | null | undefined): EmpireFaction | null {
  return factionId == null ? null : (BY_ID.get(factionId) ?? null);
}
