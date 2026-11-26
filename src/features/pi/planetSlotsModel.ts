export const PLANET_SLOTS_MAX = 6;

export interface PlanetSlots {
  slots: number;
  assumed: boolean;
}

export function planetSlots(skillLevel: number | null): PlanetSlots {
  const level = Math.min(Math.max(Math.trunc(skillLevel ?? 0), 0), PLANET_SLOTS_MAX - 1);
  return { slots: level + 1, assumed: skillLevel == null };
}
