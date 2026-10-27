/** The game's research bounds: ME researches to 10, TE to 20. */
export const ME_MAX = 10;
export const TE_MAX = 20;

/** ME is 0..ME_MAX in the engine, which range-checks it and throws outside that. */
export function clampMe(me: number): number {
  return Math.min(ME_MAX, Math.max(0, Math.round(me)));
}
