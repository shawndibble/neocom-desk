/**
 * The wire contract every ESI call out of `functions/` shares: the routed base,
 * the compatibility date, our User-Agent, and the header block CCP asks for
 * (CLAUDE.md: "ESI calls always send `X-Compatibility-Date` and a descriptive
 * `X-User-Agent`"). It lived spelled out at a dozen call sites, where bumping
 * the compatibility date meant finding all of them and a new call could quietly
 * go out identifying itself as nobody.
 */

export const ESI_BASE = 'https://esi.evetech.net/latest';
export const ESI_COMPATIBILITY_DATE = '2026-08-01';
/** Descriptive and with a contact route, never an address: headers travel. */
export const ESI_USER_AGENT = 'Neocom Desk (github.com/shawndibble/neocom-desk)';

/**
 * The headers an ESI request sends, carrying `Authorization` when a token is
 * given. Spread it to add the rest (`If-None-Match`, `Content-Type`) on top.
 */
export function esiHeaders(accessToken?: string | null): Record<string, string> {
  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'User-Agent': ESI_USER_AGENT,
    'X-User-Agent': ESI_USER_AGENT,
    'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
    Accept: 'application/json',
  };
}
