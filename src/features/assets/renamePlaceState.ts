export const RENAME_PLACE_STATE = { renamePlace: true } as const;

export function isRenamePlaceState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { renamePlace?: unknown }).renamePlace === true
  );
}
