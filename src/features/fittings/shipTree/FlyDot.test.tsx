import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FlyDot } from './FlyDot';

const LOCKED = { canFly: false, secondsToFly: 100, mastery: 0 };
const CAN_FLY = { canFly: true, secondsToFly: 0, mastery: 3 };
const ELITE = { canFly: true, secondsToFly: 0, mastery: 5 };

function marker(status: Parameters<typeof FlyDot>[0]['status']) {
  const { container } = render(<FlyDot status={status} />);
  return container.firstElementChild as HTMLElement;
}

describe('FlyDot', () => {
  it('draws three structurally distinct markers: ring, dot, star', () => {
    const locked = marker(LOCKED);
    const canFly = marker(CAN_FLY);
    const elite = marker(ELITE);
    expect(locked.dataset.shape).toBe('ring');
    expect(canFly.dataset.shape).toBe('dot');
    expect(elite.dataset.shape).toBe('star');
    // Shape, not just fill: only the star is an svg, only the ring is hollow.
    expect(elite.tagName.toLowerCase()).toBe('svg');
    expect(locked.tagName.toLowerCase()).toBe('span');
    expect(canFly.tagName.toLowerCase()).toBe('span');
    expect(locked.className).toMatch(/\bborder\b/);
    expect(locked.className).not.toMatch(/\bbg-/);
    expect(canFly.className).toMatch(/\bbg-text\b/);
  });

  it('treats a missing status as locked and stays hidden from assistive tech', () => {
    for (const status of [undefined, LOCKED, CAN_FLY, ELITE]) {
      const el = marker(status);
      expect(el.getAttribute('aria-hidden')).toBe('true');
    }
    expect(marker(undefined).dataset.shape).toBe('ring');
  });
});
