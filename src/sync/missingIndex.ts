export function isMissingIndex(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'failed-precondition';
}
