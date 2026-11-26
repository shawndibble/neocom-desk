export const ME_MAX = 10;
export const TE_MAX = 20;

export function clampMe(me: number): number {
  return Math.min(ME_MAX, Math.max(0, Math.round(me)));
}
