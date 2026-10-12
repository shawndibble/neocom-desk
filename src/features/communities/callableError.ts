/** The Firebase Functions error code without its `functions/` prefix, or null for anything else. */
export function callableErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.replace(/^functions\//, '') : null;
}
