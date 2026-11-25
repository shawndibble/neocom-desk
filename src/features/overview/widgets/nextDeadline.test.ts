import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { chipTone, nextDeadline } from './nextDeadline';

const NOW = 1_000_000_000;

const cand = (at: number, note = 'x') => ({ at, note, severity: 'clear' as const, to: '/x' });

describe('nextDeadline', () => {
  it('returns the soonest candidate that is still ahead', () => {
    const a = cand(NOW + 5 * HOUR_MS, 'a');
    const b = cand(NOW + 1 * HOUR_MS, 'b');
    const c = cand(NOW + 9 * HOUR_MS, 'c');
    expect(nextDeadline([a, b, c], NOW)).toBe(b);
  });

  it('skips candidates already past or due exactly now', () => {
    const past = cand(NOW - HOUR_MS, 'past');
    const nowish = cand(NOW, 'now');
    const later = cand(NOW + HOUR_MS, 'later');
    expect(nextDeadline([past, nowish, later], NOW)).toBe(later);
  });

  it('is null when nothing is ahead', () => {
    expect(nextDeadline([], NOW)).toBeNull();
    expect(nextDeadline([cand(NOW - 1)], NOW)).toBeNull();
  });

  it('does not reorder or mutate its input', () => {
    const list = [cand(NOW + 2 * HOUR_MS), cand(NOW + HOUR_MS)];
    const copy = [...list];
    nextDeadline(list, NOW);
    expect(list).toEqual(copy);
  });
});

describe('chipTone', () => {
  it('is neutral from three hours up', () => {
    expect(chipTone(3 * HOUR_MS)).toBe('neutral');
    expect(chipTone(2 * 24 * HOUR_MS)).toBe('neutral');
  });

  it('is warning under three hours', () => {
    expect(chipTone(3 * HOUR_MS - 1)).toBe('warning');
    expect(chipTone(30 * MINUTE_MS)).toBe('warning');
  });

  it('is danger under thirty minutes, including already due', () => {
    expect(chipTone(30 * MINUTE_MS - 1)).toBe('danger');
    expect(chipTone(1)).toBe('danger');
    expect(chipTone(0)).toBe('danger');
    expect(chipTone(-5)).toBe('danger');
  });
});
