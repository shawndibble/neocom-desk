/** The history state a link or programmatic open stamps on the entry it pushes. */
export const ENTITY_INFO_PUSHED_STATE = { entityInfo: true } as const;

/** Whether this history entry was pushed by the app (so Close can go back), not opened cold. */
export function wasPushedHere(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'entityInfo' in state;
}
