import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Reveal } from './Reveal';

type Cb = (entries: { isIntersecting: boolean }[]) => void;

function mockObserver() {
  const state = { cb: (() => {}) as Cb, observed: 0 };
  class MockObserver {
    constructor(cb: Cb) {
      state.cb = cb;
    }
    observe() {
      state.observed += 1;
    }
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockObserver);
  return state;
}

afterEach(() => vi.unstubAllGlobals());

describe('Reveal', () => {
  it('renders visible content when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Reveal>hello</Reveal>);
    expect(screen.getByText('hello')).not.toHaveAttribute('data-reveal');
  });

  it('hides a below-the-fold element, then shows it once on intersect', () => {
    const state = mockObserver();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 5000,
    } as DOMRect);
    render(<Reveal>below</Reveal>);
    const el = screen.getByText('below');
    expect(el).toHaveAttribute('data-reveal', 'hidden');
    expect(state.observed).toBe(1);
    act(() => state.cb([{ isIntersecting: true }]));
    expect(el).toHaveAttribute('data-reveal', 'shown');
  });

  it('never hides an element already in the first viewport', () => {
    mockObserver();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 10,
    } as DOMRect);
    render(<Reveal>above</Reveal>);
    expect(screen.getByText('above')).not.toHaveAttribute('data-reveal');
  });
});
