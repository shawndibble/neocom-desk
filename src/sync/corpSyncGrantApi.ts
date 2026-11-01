/**
 * The two Corp Tax Book sync grant callables (ADR 0025). Firebase: reach this
 * only through `await import(...)` from anything the startup bundle reaches
 * (`app/bootImportGraph.test.ts`).
 *
 * Saving needs the signed-in Character that holds the grant (the server checks
 * the grant's token is that Character's, and reads their corporation and roles
 * with it). Revoking is the holder's own act, or the CEO's with a live token.
 */
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

/** A moon owner's grant (ADR 0025 amendment): the signed-in player is the holder, whichever alt authorised. */
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

/** The server's `details.reason` for a refusal; anything without one reads `unknown`. */
const refusal = (error: unknown): OwnCorpResult => ({
  ok: false,
  reason: callableErrorReason(error) ?? 'unknown',
});

/**
 * Add one of the player's own corporations to a Corp Tax Book as a moon owner, with no invite
 * link: the editor's roles-scope token proves their standing in the book, and the CEO alt's
 * mining-scope tokens (a separate sign-in) are the grant. `coverageFrom` is a UTC day, up to 30
 * days back; the server clamps it.
 */
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

/** End one of the player's own corporations as a moon owner at once; the book keeps its history. */
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
