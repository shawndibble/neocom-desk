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

/** A moon owner's grant carries this one scope: the observer ledger, nothing else (ADR 0025 amendment). */
export const FEEDER_SYNC_SCOPES = ['esi-industry.read_corporation_mining.v1'] as const;
