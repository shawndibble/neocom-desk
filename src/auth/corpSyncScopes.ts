/**
 * The scopes the Corp Tax Book sync grant asks for (ADR 0025). Kept apart from
 * `esi/scopes` on purpose, like `alertsScope.ts`: it is never part of a device
 * login's grant, so no Permission group may list it. The server checks the token
 * for exactly this set (`functions/src/corpSyncScopes.ts`; a test pins the two).
 */
export const CORP_SYNC_SCOPES = [
  'esi-industry.read_corporation_mining.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-characters.read_notifications.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-universe.read_structures.v1',
] as const;

/**
 * A moon owner's grant (ADR 0025 amendment, #4654): the observer ledger, and its refineries'
 * names and systems (`/universe/structures`). Nothing else. A grant from before #4654 carries
 * the ledger scope only and still syncs; it just shows no refinery names.
 */
export const FEEDER_SYNC_SCOPES = [
  'esi-industry.read_corporation_mining.v1',
  'esi-universe.read_structures.v1',
] as const;
