export const FITTING_SHARE_PAYLOAD_VERSION = 1;

export const MAX_FITTING_SHARE_CODE_LENGTH = 20_100;

export interface FittingSharePayload {
  v: typeof FITTING_SHARE_PAYLOAD_VERSION;
  code: string;
}

export function fittingSharePayload(code: string): FittingSharePayload {
  return { v: FITTING_SHARE_PAYLOAD_VERSION, code };
}

export function parseFittingSharePayload(raw: unknown): FittingSharePayload | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.v !== FITTING_SHARE_PAYLOAD_VERSION) return null;
  if (typeof data.code !== 'string') return null;
  if (data.code === '' || data.code.length > MAX_FITTING_SHARE_CODE_LENGTH) return null;
  return fittingSharePayload(data.code);
}
