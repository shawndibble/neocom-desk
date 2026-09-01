// Verify an EVE SSO access token (JWT) and extract identity claims.
//
// Claim values verified against https://login.eveonline.com/.well-known/oauth-authorization-server
// and https://docs.esi.evetech.net/docs/sso/validating_eve_jwt.html (2026-08-29):
//   - JWKS:     https://login.eveonline.com/oauth/jwks
//   - issuer:   "https://login.eveonline.com" (docs also allow bare "login.eveonline.com")
//   - audience: contains "EVE Online" (plus the app client_id)
//   - sub:      "CHARACTER:EVE:{characterId}"
//   - owner:    character owner hash — changes when the character is transferred
//
// App binding: "EVE Online" alone is NOT enough — every EVE app's tokens carry
// it, so a token minted by any third-party EVE app would otherwise be accepted
// here. The token must additionally name one of THIS deployment's client_ids
// (EVE_CLIENT_ID), either in the aud array (EVE tokens carry
// [client_id, "EVE Online"]) or as the azp (authorized party) claim.
//
// EVE_CLIENT_ID is a comma-separated list, not a single value: dev
// (localhost callback) and prod (GitHub Pages callback) are separate EVE
// application registrations with different client_ids, but both point at
// this one deployed function — it must accept either.
//
// JWKS URL / issuer / audience are injectable via env so tests can point at a
// locally served key set.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface EveTokenClaims {
  characterId: number;
  ownerHash: string;
  /** Character name (informational only). */
  name: string;
}

export interface VerifyOptions {
  /** Key resolver, e.g. jose createRemoteJWKSet / createLocalJWKSet. */
  getKey: JWTVerifyGetKey;
  issuer: string | string[];
  audience: string;
  /** This deployment's EVE client_ids; tokens minted for other apps are rejected. */
  clientIds: readonly string[];
}

export const DEFAULT_JWKS_URL = 'https://login.eveonline.com/oauth/jwks';
export const DEFAULT_ISSUERS = ['https://login.eveonline.com', 'login.eveonline.com'];
export const DEFAULT_AUDIENCE = 'EVE Online';

/** Firebase auth uid for an EVE character. Same character => same uid on every device. */
export function uidForCharacter(characterId: number): string {
  return `char:${characterId}`;
}

/**
 * Verify signature (via JWKS), issuer, audience, and expiry; return identity.
 * Throws on any validation failure.
 */
export async function verifyEveAccessToken(
  token: string,
  opts: VerifyOptions
): Promise<EveTokenClaims> {
  const { payload } = await jwtVerify(token, opts.getKey, {
    issuer: opts.issuer,
    audience: opts.audience,
  });

  // jwtVerify only proved the generic "EVE Online" audience. Also require the
  // token to be bound to one of THIS deployment's apps (see header comment).
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  const boundToKnownApp =
    audiences.some((aud) => opts.clientIds.includes(aud)) ||
    (typeof payload.azp === 'string' && opts.clientIds.includes(payload.azp));
  if (!boundToKnownApp) {
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
  };
}

/**
 * Production verify options. EVE_CLIENT_ID is REQUIRED (fail closed: without
 * it any EVE app's tokens would be accepted) and is comma-separated — dev and
 * prod are separate EVE application registrations sharing this one deployed
 * function. Env overrides exist for tests (EVE_JWKS_URL, EVE_ISSUER,
 * EVE_AUDIENCE).
 */
export function verifyOptionsFromEnv(): VerifyOptions {
  const raw = process.env.EVE_CLIENT_ID;
  const clientIds = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (clientIds.length === 0) {
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
