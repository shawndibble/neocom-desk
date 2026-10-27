import { describe, expect, it } from 'vitest';
import { spacedLabels } from './labelSpacing';

describe('spacedLabels', () => {
  it('keeps every label when they all have room', () => {
    const kept = spacedLabels(
      [
        { x: 0, weight: 1 },
        { x: 100, weight: 1 },
        { x: 200, weight: 1 },
      ],
      40
    );
    expect([...kept].sort()).toEqual([0, 1, 2]);
  });

  it('drops the lighter of two labels that collide', () => {
    const kept = spacedLabels(
      [
        { x: 0, weight: 1 },
        { x: 10, weight: 5 },
        { x: 200, weight: 1 },
      ],
      40
    );
    expect(kept.has(1)).toBe(true);
    expect(kept.has(0)).toBe(false);
    expect(kept.has(2)).toBe(true);
  });

  it('always keeps the last label, even when a heavier one sits beside it', () => {
    const kept = spacedLabels(
      [
        { x: 0, weight: 9 },
        { x: 190, weight: 9 },
        { x: 200, weight: 1 },
      ],
      40
    );
    expect(kept.has(2)).toBe(true);
    expect(kept.has(1)).toBe(false);
    expect(kept.has(0)).toBe(true);
  });

  it('thins a dense cluster to labels at least minGap apart', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, weight: i }));
    const kept = [...spacedLabels(items, 30)].map((i) => items[i].x).sort((a, b) => a - b);
    for (let i = 1; i < kept.length; i++) expect(kept[i] - kept[i - 1]).toBeGreaterThanOrEqual(30);
    expect(kept.length).toBeGreaterThan(1);
  });

  it('handles an empty list', () => {
    expect(spacedLabels([], 40).size).toBe(0);
  });
});
