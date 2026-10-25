// The Incursion states the app counts (src/engine/incursions/incursionRows.ts's
// INCURSION_STATES; functions/ cannot import src/, nearbyAlerts.test.ts pins the copy).
// A state ESI adds later is dropped, as Route Safety drops it.
export const INCURSION_STATES = ['mobilizing', 'established', 'withdrawing'] as const;
export type IncursionState = (typeof INCURSION_STATES)[number];
