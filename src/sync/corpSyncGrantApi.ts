import { getValidAccessToken } from '@/auth/session';
import { callableErrorReason } from '@/lib/callableError';
import { callRouted } from './routedCallable';
import { ensureSignedIn } from './syncAuth';

export async function saveCorpSyncGrantRemote(
  characterId: number,
  grant: { corporationId: number; accessToken: string; refreshToken: string }
): Promise<void> {
  await ensureSignedIn(characterId);
  await callRouted<typeof grant, { characterId: number; enabledAt: number }>(
    'saveCorpTaxBookSyncGrantCallable',
    grant,
    characterId
  );
}

export async function revokeCorpSyncGrantRemote(
  characterId: number,
  call: { corporationId: number; accessToken?: string }
): Promise<void> {
  await ensureSignedIn(characterId);
  await callRouted<typeof call, { deleted: boolean; revoked: boolean }>(
    'revokeCorpTaxBookSyncGrantCallable',
    call,
    characterId
  );
}

export interface FeederGrantCall {
  code: string;
  accessToken: string;
  refreshToken: string;
  requestedRatePct?: number;
}

export async function saveFeederGrantRemote(
  characterId: number,
  grant: FeederGrantCall
): Promise<{ collectorCorporationId: number; feederCorporationId: number; rejoined: boolean }> {
  await ensureSignedIn(characterId);
  return callRouted<
    FeederGrantCall,
    { collectorCorporationId: number; feederCorporationId: number; rejoined: boolean }
  >('saveCorpTaxBookFeederGrantCallable', grant, characterId);
}

type OwnCorpResult = { ok: true } | { ok: false; reason: string };

const refusal = (error: unknown): OwnCorpResult => ({
  ok: false,
  reason: callableErrorReason(error) ?? 'unknown',
});

export async function addOwnCorpFeederRemote(args: {
  editorCharacterId: number;
  collectorCorporationId: number;
  feederCorporationId: number;
  grantAccessToken: string;
  grantRefreshToken: string;
  coverageFrom?: string;
}): Promise<OwnCorpResult> {
  await ensureSignedIn(args.editorCharacterId);
  const accessToken = await getValidAccessToken(args.editorCharacterId);
  try {
    await callRouted<Record<string, unknown>, unknown>(
      'addOwnCorpTaxBookFeederCallable',
      {
        corporationId: args.collectorCorporationId,
        accessToken,
        feederCorporationId: args.feederCorporationId,
        grantAccessToken: args.grantAccessToken,
        grantRefreshToken: args.grantRefreshToken,
        ...(args.coverageFrom === undefined ? {} : { coverageFrom: args.coverageFrom }),
      },
      args.editorCharacterId
    );
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function removeOwnCorpFeederRemote(args: {
  editorCharacterId: number;
  collectorCorporationId: number;
  feederCorporationId: number;
}): Promise<OwnCorpResult> {
  await ensureSignedIn(args.editorCharacterId);
  const accessToken = await getValidAccessToken(args.editorCharacterId);
  try {
    await callRouted<Record<string, unknown>, unknown>(
      'removeOwnCorpTaxBookFeederCallable',
      {
        corporationId: args.collectorCorporationId,
        accessToken,
        feederCorporationId: args.feederCorporationId,
      },
      args.editorCharacterId
    );
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export type MoonOwnersSyncNowResult =
  | { kind: 'synced'; read: number; stale: number; skipped: number }
  | { kind: 'rate-limited'; retryAt: number }
  | { kind: 'refused'; reason: string };

export async function syncMoonOwnersNowRemote(args: {
  editorCharacterId: number;
  collectorCorporationId: number;
}): Promise<MoonOwnersSyncNowResult> {
  await ensureSignedIn(args.editorCharacterId);
  const accessToken = await getValidAccessToken(args.editorCharacterId);
  try {
    return await callRouted<Record<string, unknown>, MoonOwnersSyncNowResult>(
      'syncCorpTaxBookMoonOwnersNowCallable',
      { corporationId: args.collectorCorporationId, accessToken },
      args.editorCharacterId
    );
  } catch (error) {
    return { kind: 'refused', reason: callableErrorReason(error) ?? 'unknown' };
  }
}
