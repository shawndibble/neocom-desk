export const CORP_SYNC_SCOPES = [
  'esi-industry.read_corporation_mining.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-characters.read_notifications.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-universe.read_structures.v1',
] as const;

export const FEEDER_SYNC_SCOPES = [
  'esi-industry.read_corporation_mining.v1',
  'esi-universe.read_structures.v1',
  'esi-characters.read_notifications.v1',
] as const;
