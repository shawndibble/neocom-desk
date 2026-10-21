/**
 * The two Alerts Grant callables (ADR 0020). Firebase: reach this only through
 * `await import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * `saveAlertGrant` is proven by the notifications-only access token itself, so
 * it needs no Firebase session. `deleteAlertGrant` is the opposite: it acts on
 * the signed-in Character, so one Character cannot drop another's grant.
 */
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

export async function saveAlertGrantRemote(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  await callRouted<typeof tokens, { characterId: number; enabledAt: number }>(
    'saveAlertGrant',
    tokens
  );
}

export async function deleteAlertGrantRemote(characterId: number): Promise<void> {
  await ensureSignedIn(characterId);
  await callRouted<Record<string, never>, { deleted: boolean; revoked: boolean }>(
    'deleteAlertGrant',
    {}
  );
}
