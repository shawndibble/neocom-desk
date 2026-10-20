/**
 * The two Corp Tax Book sync grant callables (ADR 0025). Firebase: reach this
 * only through `await import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * Saving needs the signed-in Character that holds the grant (the server checks
 * the grant's token is that Character's, and reads their corporation and roles
 * with it). Revoking is the holder's own act, or the CEO's with a live token.
 */
import { httpsCallable } from 'firebase/functions';
import { getSyncFunctions } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';

export async function saveCorpSyncGrantRemote(
  characterId: number,
  grant: { corporationId: number; accessToken: string; refreshToken: string }
): Promise<void> {
  await ensureSignedIn(characterId);
  const call = httpsCallable<typeof grant, { characterId: number; enabledAt: number }>(
    getSyncFunctions(),
    'saveCorpTaxBookSyncGrantCallable'
  );
  await call(grant);
}

export async function revokeCorpSyncGrantRemote(
  characterId: number,
  call: { corporationId: number; accessToken?: string }
): Promise<void> {
  await ensureSignedIn(characterId);
  const revoke = httpsCallable<typeof call, { deleted: boolean; revoked: boolean }>(
    getSyncFunctions(),
    'revokeCorpTaxBookSyncGrantCallable'
  );
  await revoke(call);
}

export interface FeederGrantCall {
  code: string;
  accessToken: string;
  refreshToken: string;
  requestedRatePct?: number;
}

/** A moon owner's grant (ADR 0025 amendment): the signed-in player is the holder, whichever alt authorised. */
export async function saveFeederGrantRemote(
  characterId: number,
  grant: FeederGrantCall
): Promise<{ collectorCorporationId: number; feederCorporationId: number; rejoined: boolean }> {
  await ensureSignedIn(characterId);
  const save = httpsCallable<
    FeederGrantCall,
    { collectorCorporationId: number; feederCorporationId: number; rejoined: boolean }
  >(getSyncFunctions(), 'saveCorpTaxBookFeederGrantCallable');
  return (await save(grant)).data;
}
