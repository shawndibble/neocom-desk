/** Helpers shared by the sandbox's ESI generators. Deterministic: no Math.random. */

export const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

/** Small stable hash so generated rows differ without randomness. */
export const mix = (n: number): number => ((n * 2654435761) >>> 0) % 1000;

/** NPC station names, shared by the character fixtures and the `/universe/names` answer. */
export const STATION_NAMES: Record<number, string> = {
  60003760: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
  60008494: 'Amarr VIII (Oris) - Emperor Family Academy',
};
