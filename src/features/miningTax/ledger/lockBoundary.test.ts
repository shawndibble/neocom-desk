import { describe, expect, it } from 'vitest';
import { lockBoundaryKey } from './lockBoundary';

const key = (dates: string[]) =>
  lockBoundaryKey(
    dates.map((date, i) => ({ date, i })),
    '2026-10-01',
    (r) => r.date,
    (r) => r.i
  );

describe('lockBoundaryKey', () => {
  it('opens the older run in a newest-first list', () => {
    expect(key(['2026-11-02', '2026-10-01', '2026-09-30', '2026-09-01'])).toBe(2);
  });
  it('closes the older run in an oldest-first list', () => {
    expect(key(['2026-09-01', '2026-09-30', '2026-10-01', '2026-11-02'])).toBe(2);
  });
  it('sits at the top when every row is older', () => {
    expect(key(['2026-09-30', '2026-09-01'])).toBe(0);
  });
  it('has none when nothing is older, or the sides are mixed by another sort', () => {
    expect(key(['2026-11-02', '2026-10-01'])).toBeUndefined();
    expect(key(['2026-09-01', '2026-11-02', '2026-09-02'])).toBeUndefined();
    expect(key([])).toBeUndefined();
  });
});
