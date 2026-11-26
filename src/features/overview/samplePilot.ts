export const swing = (i: number, k: number, phase = 0): number => Math.sin(i * k + phase);

export const wobble = (i: number, k: number): number => (swing(i, k) + 1) / 2;
