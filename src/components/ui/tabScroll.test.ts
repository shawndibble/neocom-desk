import { describe, expect, it } from 'vitest';
import { pageScrollDelta, revealScrollDelta, scrollEdges, wheelScrollDelta } from './tabScroll';

describe('scrollEdges', () => {
  it('has nothing beyond either edge when the bar fits', () => {
    expect(scrollEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 400 })).toEqual({
      before: false,
      after: false,
    });
  });

  it('has more after the right edge at rest', () => {
    expect(scrollEdges({ scrollLeft: 0, clientWidth: 400, scrollWidth: 700 })).toEqual({
      before: false,
      after: true,
    });
  });

  it('has more on both sides mid-way', () => {
    expect(scrollEdges({ scrollLeft: 100, clientWidth: 400, scrollWidth: 700 })).toEqual({
      before: true,
      after: true,
    });
  });

  it('has more only before once scrolled to the end, within a pixel of rounding', () => {
    expect(scrollEdges({ scrollLeft: 299.6, clientWidth: 400, scrollWidth: 700 })).toEqual({
      before: true,
      after: false,
    });
  });
});

describe('wheelScrollDelta', () => {
  const mid = { before: true, after: true };

  it('turns a vertical wheel into sideways travel', () => {
    expect(wheelScrollDelta({ deltaX: 0, deltaY: 100, deltaMode: 0 }, mid)).toBe(100);
    expect(wheelScrollDelta({ deltaX: 0, deltaY: -100, deltaMode: 0 }, mid)).toBe(-100);
  });

  it('leaves a sideways gesture (trackpad, shift+wheel) to the browser', () => {
    expect(wheelScrollDelta({ deltaX: 80, deltaY: 10, deltaMode: 0 }, mid)).toBeNull();
  });

  it('lets the page scroll once the bar is at the end it was pushed toward', () => {
    expect(
      wheelScrollDelta({ deltaX: 0, deltaY: 100, deltaMode: 0 }, { before: true, after: false })
    ).toBeNull();
    expect(
      wheelScrollDelta({ deltaX: 0, deltaY: -100, deltaMode: 0 }, { before: false, after: true })
    ).toBeNull();
  });

  it('does nothing for a bar that fits', () => {
    expect(
      wheelScrollDelta({ deltaX: 0, deltaY: 100, deltaMode: 0 }, { before: false, after: false })
    ).toBeNull();
  });

  it('scales a line-mode wheel (Firefox) to pixels', () => {
    expect(wheelScrollDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 }, mid)).toBe(48);
  });
});

describe('pageScrollDelta', () => {
  it('moves three quarters of the bar so the last tab stays in view as an anchor', () => {
    expect(pageScrollDelta('after', 400)).toBe(300);
    expect(pageScrollDelta('before', 400)).toBe(-300);
  });
});

describe('revealScrollDelta', () => {
  const bar = { start: 10, end: 400 };

  it('stays put when the item is already inside the bar', () => {
    expect(revealScrollDelta(bar, { left: 50, right: 200 })).toBe(0);
  });

  it('moves forward by the part cut off past the end', () => {
    expect(revealScrollDelta(bar, { left: 300, right: 460 })).toBe(60);
  });

  it('moves back by the part cut off before the start', () => {
    expect(revealScrollDelta(bar, { left: -40, right: 100 })).toBe(-50);
  });
});
