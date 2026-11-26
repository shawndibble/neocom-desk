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

export function empireFactionOf(factionId: number | null | undefined): EmpireFaction | null {
  return factionId == null ? null : (BY_ID.get(factionId) ?? null);
}
