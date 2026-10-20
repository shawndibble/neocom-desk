/**
 * What the Overview's two stand-in pilots (the landing demo and the widget
 * Gallery's previews) have in common. Pure and import-free so the landing
 * demo chunk can load it without pulling in the widget stack.
 */

/** A deterministic swing in -1..1: the same on every render, so a sample never twitches. */
export const swing = (i: number, k: number, phase = 0): number => Math.sin(i * k + phase);

/** `swing` rescaled to 0..1. */
export const wobble = (i: number, k: number): number => (swing(i, k) + 1) / 2;
