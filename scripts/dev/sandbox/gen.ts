/** Helpers shared by the sandbox's ESI generators. Deterministic: no Math.random. */

export const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

/** Small stable hash so generated rows differ without randomness. */
export const mix = (n: number): number => ((n * 2654435761) >>> 0) % 1000;
