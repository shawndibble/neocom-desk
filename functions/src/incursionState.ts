// Lives in functions/src (deploy uploads functions/ alone); src re-exports it. Keep it import-free.
// The Incursion states the app counts. A state ESI adds later is dropped, as Route Safety drops it.
export const INCURSION_STATES = ['mobilizing', 'established', 'withdrawing'] as const;
export type IncursionState = (typeof INCURSION_STATES)[number];
