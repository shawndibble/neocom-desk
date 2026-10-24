import { describe, expect, it } from 'vitest';
import { chipTone, nextDeadline, nextShape, reservedNextHeight } from './nextDeadline';

const HOUR = 3_600_000;
const MIN = 60_000;
const NOW = 1_000_000_000;

const cand = (at: number, note = 'x') => ({ at, note, severity: 'clear' as const, to: '/x' });

describe('nextDeadline', () => {
  it('returns the soonest candidate that is still ahead', () => {
    const a = cand(NOW + 5 * HOUR, 'a');
    const b = cand(NOW + 1 * HOUR, 'b');
    const c = cand(NOW + 9 * HOUR, 'c');
    expect(nextDeadline([a, b, c], NOW)).toBe(b);
  });

  it('skips candidates already past or due exactly now', () => {
    const past = cand(NOW - HOUR, 'past');
    const nowish = cand(NOW, 'now');
    const later = cand(NOW + HOUR, 'later');
    expect(nextDeadline([past, nowish, later], NOW)).toBe(later);
  });

  it('is null when nothing is ahead', () => {
    expect(nextDeadline([], NOW)).toBeNull();
    expect(nextDeadline([cand(NOW - 1)], NOW)).toBeNull();
  });

  it('does not reorder or mutate its input', () => {
    const list = [cand(NOW + 2 * HOUR), cand(NOW + HOUR)];
    const copy = [...list];
    nextDeadline(list, NOW);
    expect(list).toEqual(copy);
  });
});

describe('chipTone', () => {
  it('is neutral from three hours up', () => {
    expect(chipTone(3 * HOUR)).toBe('neutral');
    expect(chipTone(2 * 24 * HOUR)).toBe('neutral');
  });

  it('is warning under three hours', () => {
    expect(chipTone(3 * HOUR - 1)).toBe('warning');
    expect(chipTone(30 * MIN)).toBe('warning');
  });

  it('is danger under thirty minutes, including already due', () => {
    expect(chipTone(30 * MIN - 1)).toBe('danger');
    expect(chipTone(1)).toBe('danger');
    expect(chipTone(0)).toBe('danger');
    expect(chipTone(-5)).toBe('danger');
  });
});

describe('nextShape', () => {
  it('is a link when a page owns the clock, a readout when none does, else nothing', () => {
    expect(nextShape({ to: '/skills' })).toBe('link');
    expect(nextShape({})).toBe('text');
    expect(nextShape(null)).toBe('none');
  });
});

describe('reservedNextHeight', () => {
  it("holds the room last time's shape took", () => {
    expect(reservedNextHeight('link')).toBe('h-11');
    expect(reservedNextHeight('text')).toBe('h-5');
    expect(reservedNextHeight('none')).toBeNull();
  });

  it("holds the button's room when nothing is remembered", () => {
    expect(reservedNextHeight(null)).toBe('h-11');
    expect(reservedNextHeight('junk')).toBe('h-11');
  });
});
