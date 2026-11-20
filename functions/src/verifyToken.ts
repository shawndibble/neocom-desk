/**
 * A Statement's verify token: random bytes as unpadded base64url. One file, so the client's
 * mail counter (`src/engine/corpTaxBook/verifyToken.ts` re-exports it) counts the real link.
 * Pure: the server draws the bytes with `randomBytes(VERIFY_TOKEN_BYTES)`.
 */
export const VERIFY_TOKEN_BYTES = 32;
/** The token's length in characters: 4 per 3 bytes, unpadded. */
export const VERIFY_TOKEN_LENGTH = Math.ceil((VERIFY_TOKEN_BYTES * 4) / 3);
