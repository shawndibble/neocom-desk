/** The Firebase Functions error code without its `functions/` prefix, or null for anything else. */
export function callableErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.replace(/^functions\//, '') : null;
}

/** The machine-readable `details.reason` a callable attaches to a refusal, when it does. */
export function callableErrorReason(err: unknown): string | null {
  const reason = (err as { details?: { reason?: unknown } } | null)?.details?.reason;
  return typeof reason === 'string' ? reason : null;
}
