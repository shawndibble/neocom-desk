// Decode EVE SSO access token (JWT) payload.
// No signature verification: token arrives from login.eveonline.com over TLS
// and is only used client-side; ESI verifies it server-side on every request.

export interface DecodedAccessToken {
  characterId: number;
  name: string;
  ownerHash: string;
  /** Expiry, epoch milliseconds. */
  expiresAt: number;
  scopes: string[];
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return atob(padded);
}

export function decodeAccessToken(jwt: string): DecodedAccessToken {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Not a JWT');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JWT payload');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const match = /^CHARACTER:EVE:(\d+)$/.exec(sub);
  if (!match) throw new Error(`Unexpected JWT sub: ${sub}`);

  const scp = payload.scp;
  const scopes = Array.isArray(scp) ? scp.map(String) : typeof scp === 'string' ? [scp] : [];

  return {
    characterId: Number(match[1]),
    name: String(payload.name ?? ''),
    ownerHash: String(payload.owner ?? ''),
    expiresAt: Number(payload.exp) * 1000,
    scopes
  };
}
