// The scopes a Corp Tax Book sync grant carries (issue #4068, ADR 0025). Kept
// dependency-free so the root suite can check the browser's copy
// (src/auth/corpSyncScopes.ts) against it.

/**
 * The only scopes a sync grant may carry, and all of them are required:
 * the observer ledger and extractions (mining), the wallet journal, the moon
 * notifications, the holder's roles (re-checked every run), and the refinery's
 * solar system.
 */
export const CORP_SYNC_SCOPES = [
  'esi-industry.read_corporation_mining.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-characters.read_notifications.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-universe.read_structures.v1',
] as const;

/** A feeder's grant carries this one scope: the observer ledger, nothing else (ADR 0025 amendment). */
export const FEEDER_SYNC_SCOPES = ['esi-industry.read_corporation_mining.v1'] as const;
