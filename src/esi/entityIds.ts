/**
 * CCP's id blocks for NPC entities, from the published ID-ranges table
 * (developers.eveonline.com/docs/guides/id-ranges): NPC corporations are
 * 1,000,000–1,999,999 and NPC characters — mission agents and NPC
 * corporation CEOs — 3,000,000–3,999,999. Player characters, corporations and
 * alliances are never issued an id in either block, so the split needs no
 * lookup: a contact list of hundreds can be marked without a request per row.
 */
export function isNpcCharacterId(id: number): boolean {
  return id >= 3_000_000 && id < 4_000_000;
}

export function isNpcCorporationId(id: number): boolean {
  return id >= 1_000_000 && id < 2_000_000;
}
