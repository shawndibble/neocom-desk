import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { OverviewDemo } from './OverviewDemo';

type Cb = (entries: { isIntersecting: boolean }[]) => void;

function mockObserver() {
  const state = { cb: (() => {}) as Cb };
  class MockObserver {
    constructor(cb: Cb) {
      state.cb = cb;
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockObserver);
  return state;
}

const badge = () => screen.getByRole('button', { name: /Alerts, \d+ waiting/ });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OverviewDemo alert auto-play', () => {
  it('starts with 4 alerts and a fifth arrives after 3s in view, once', () => {
    const state = mockObserver();
    render(
      <MemoryRouter>
        <OverviewDemo />
      </MemoryRouter>
    );
    expect(badge()).toHaveAccessibleName('Alerts, 4 waiting');
    act(() => state.cb([{ isIntersecting: true }]));
    act(() => void vi.advanceTimersByTime(2900));
    expect(badge()).toHaveAccessibleName('Alerts, 4 waiting');
    act(() => void vi.advanceTimersByTime(200));
    expect(badge()).toHaveAccessibleName('Alerts, 5 waiting');
  });

  it('does not count while off-screen', () => {
    const state = mockObserver();
    render(
      <MemoryRouter>
        <OverviewDemo />
      </MemoryRouter>
    );
    act(() => state.cb([{ isIntersecting: true }]));
    act(() => void vi.advanceTimersByTime(2000));
    act(() => state.cb([{ isIntersecting: false }]));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(badge()).toHaveAccessibleName('Alerts, 4 waiting');
  });

  it('is static (all 5 alerts) when reduced motion is requested', () => {
    mockObserver();
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: media.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(
      <MemoryRouter>
        <OverviewDemo />
      </MemoryRouter>
    );
    expect(badge()).toHaveAccessibleName('Alerts, 5 waiting');
    act(() => void vi.advanceTimersByTime(10_000));
    expect(badge()).toHaveAccessibleName('Alerts, 5 waiting');
  });

  it('is static without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <MemoryRouter>
        <OverviewDemo />
      </MemoryRouter>
    );
    expect(badge()).toHaveAccessibleName('Alerts, 5 waiting');
  });
});
