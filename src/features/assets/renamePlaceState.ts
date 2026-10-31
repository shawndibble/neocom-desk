/** Router state a row menu's Rename sends with the drill-in, so the heading opens its nickname field. */
export const RENAME_PLACE_STATE = { renamePlace: true } as const;

export function isRenamePlaceState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { renamePlace?: unknown }).renamePlace === true
  );
}
