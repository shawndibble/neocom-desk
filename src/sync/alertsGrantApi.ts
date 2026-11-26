import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

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
