export const INCURSION_STATES = ['mobilizing', 'established', 'withdrawing'] as const;
export type IncursionState = (typeof INCURSION_STATES)[number];
