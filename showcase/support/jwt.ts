/**
 * Hand-built, unsigned access token. `src/auth/jwt.ts` does no signature
 * check, so this is accepted exactly as a real one — and because the seeded
 * token's `expiresAt` is far future, it is never actually presented to ESI.
 */
import { CHARACTER_ID, CHARACTER_NAME, OWNER_HASH, SCOPES } from './identity';

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function makeAccessToken(): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' });
  const payload = base64url({
    sub: `CHARACTER:EVE:${CHARACTER_ID}`,
    name: CHARACTER_NAME,
    owner: OWNER_HASH,
    exp: 4_102_444_800,
    scp: [...SCOPES],
    iss: 'login.eveonline.com',
  });
  return `${header}.${payload}.showcasesig`;
}
