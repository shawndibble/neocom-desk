/**
 * What a Fitting's **Share Link** stores: its **Fitting Share Code**,
 * verbatim. Not frozen stats — a fit has no prices to freeze, and its numbers
 * belong to whoever views it (every skill at V signed out, their own pilot
 * signed in). Opening the link decodes the code exactly as the permanent URL
 * would (`fittingShare.ts`), so this only wraps and bounds it.
 */

export const FITTING_SHARE_PAYLOAD_VERSION = 1;

/**
 * Just past the longest code `decodeFittingShare` accepts (a version, a dot,
 * and 20,000 base64url characters). `firestore.rules` enforces the same cap.
 */
export const MAX_FITTING_SHARE_CODE_LENGTH = 20_100;

export interface FittingSharePayload {
  v: typeof FITTING_SHARE_PAYLOAD_VERSION;
  code: string;
}

export function fittingSharePayload(code: string): FittingSharePayload {
  return { v: FITTING_SHARE_PAYLOAD_VERSION, code };
}

/** A stored payload back, or null for anything malformed — read as an invalid link, never a crash. */
export function parseFittingSharePayload(raw: unknown): FittingSharePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.v !== FITTING_SHARE_PAYLOAD_VERSION) return null;
  if (typeof data.code !== 'string') return null;
  if (data.code === '' || data.code.length > MAX_FITTING_SHARE_CODE_LENGTH) return null;
  return fittingSharePayload(data.code);
}
