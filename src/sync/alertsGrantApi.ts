/**
 * The two Alerts Grant callables (ADR 0020). Firebase: reach this only through
 * `await import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * `saveAlertGrant` is proven by the notifications-only access token itself, so
 * it needs no Firebase session. `deleteAlertGrant` is the opposite: it acts on
 * the signed-in Character, so one Character cannot drop another's grant.
 */
import { httpsCallable } from 'firebase/functions';
import { getSyncFunctions } from './firebaseApp';
import { ensureSignedIn } from './syncAuth';

export async function saveAlertGrantRemote(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const call = httpsCallable<typeof tokens, { characterId: number; enabledAt: number }>(
    getSyncFunctions(),
    'saveAlertGrant'
  );
  await call(tokens);
}

export async function deleteAlertGrantRemote(characterId: number): Promise<void> {
  await ensureSignedIn(characterId);
  const call = httpsCallable<Record<string, never>, { deleted: boolean; revoked: boolean }>(
    getSyncFunctions(),
    'deleteAlertGrant'
  );
  await call({});
}
