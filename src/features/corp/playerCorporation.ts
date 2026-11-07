/** Player corporation ids start here; NPC corporations (1,000,000s) have no player officers. */
const FIRST_PLAYER_CORPORATION_ID = 98_000_000;

/** False for an NPC corporation: no Corp Role, so nothing the corp Permission could unlock. */
export const isPlayerCorporation = (corporationId: number): boolean =>
  corporationId >= FIRST_PLAYER_CORPORATION_ID;
