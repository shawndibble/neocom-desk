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

/**
 * `nearby` (ADR 0028) and `mail` (ADR 0029): whether the saved grant carries the
 * location / mail scope; each absent from a deployed function older than it.
 */
export async function saveAlertGrantRemote(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<{ nearby?: boolean; mail?: boolean }> {
  const { nearby, mail } = await callRouted<
    typeof tokens,
    { characterId: number; enabledAt: number; nearby?: boolean; mail?: boolean }
  >('saveAlertGrant', tokens, undefined);
  return {
    ...(typeof nearby === 'boolean' ? { nearby } : {}),
    ...(typeof mail === 'boolean' ? { mail } : {}),
  };
}

export async function deleteAlertGrantRemote(characterId: number): Promise<void> {
  await ensureSignedIn(characterId);
  await callRouted<Record<string, never>, { deleted: boolean; revoked: boolean }>(
    'deleteAlertGrant',
    {},
    characterId
  );
}
