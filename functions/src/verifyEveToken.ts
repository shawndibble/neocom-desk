import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface EveTokenClaims {
  characterId: number;
  ownerHash: string;
  name: string;
  scopes: string[];
  clientId: string;
}

export interface VerifyOptions {
  getKey: JWTVerifyGetKey;
  issuer: string | string[];
  audience: string;
  clientIds: readonly string[];
}

export const DEFAULT_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const DEFAULT_ISSUERS = ['https://login.eveonline.com', 'login.eveonline.com'];
export const DEFAULT_AUDIENCE = 'EVE Online';

export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}

function scopesOf(scp: unknown): string[] {
  if (typeof scp === 'string') return [scp];
  return Array.isArray(scp) ? scp.filter((s): s is string => typeof s === 'string') : [];
}

export function characterIdForUid(uid: string): number | undefined {
  const match = /^char:(\d+)$/.exec(uid);
  return match ? Number(match[1]) : undefined;
}

export async function verifyEveAccessToken(
  token: string,
  opts: VerifyOptions
): Promise<EveTokenClaims> {
  const { payload } = await jwtVerify(token, opts.getKey, {
    issuer: opts.issuer,
    audience: opts.audience,
  });

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  const clientId =
    audiences.find((aud) => opts.clientIds.includes(aud)) ??
    (typeof payload.azp === 'string' && opts.clientIds.includes(payload.azp)
      ? payload.azp
      : undefined);
  if (clientId === undefined) {
    throw new Error('Token was minted for a different EVE application (client_id mismatch)');
  }

  const match = /^CHARACTER:EVE:(\d+)$/.exec(String(payload.sub ?? ''));
  if (!match) throw new Error(`Unexpected sub claim: ${String(payload.sub)}`);

  const ownerHash = payload.owner;
  if (typeof ownerHash !== 'string' || ownerHash.length === 0) {
    throw new Error('Missing owner claim');
  }

  return {
    characterId: Number(match[1]),
    ownerHash,
    name: typeof payload.name === 'string' ? payload.name : '',
    scopes: scopesOf(payload.scp),
    clientId,
  };
}

export function verifyOptionsFromEnv(
  options: { allowMissingClientId?: boolean } = {}
): VerifyOptions {
  const raw = process.env.EVE_CLIENT_ID;
  const clientIds = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (clientIds.length === 0 && !options.allowMissingClientId) {
    throw new Error(
      'EVE_CLIENT_ID is not set. Set it (functions/.env or deploy-time env) to this ' +
        "deployment's EVE application client_id(s) — without it, access tokens minted " +
        'for ANY EVE application would be accepted. Comma-separate multiple values ' +
        '(e.g. dev + prod client_ids). See docs/SYNC-SETUP.md.'
    );
  }
  const jwksUrl = process.env.EVE_JWKS_URL ?? DEFAULT_JWKS_URL;
  return {
    getKey: createRemoteJWKSet(new URL(jwksUrl)),
    issuer: process.env.EVE_ISSUER ?? DEFAULT_ISSUERS,
    audience: process.env.EVE_AUDIENCE ?? DEFAULT_AUDIENCE,
    clientIds,
  };
}
