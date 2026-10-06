import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { POP_RESTORE_GIVE_UP_MS, usePopScrollRestore } from './usePopScrollRestore';

function Harness() {
  usePopScrollRestore();
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/b')}>
        push
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

function renderHarness() {
  render(
    <MemoryRouter initialEntries={['/a']}>
      <Routes>
        <Route path="*" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  window.dispatchEvent(new Event('scroll'));
}

function setPageHeight(px: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: px,
  });
}

function click(name: string) {
  act(() => screen.getByRole('button', { name }).click());
}

describe('usePopScrollRestore', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    setPageHeight(800);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setScrollY(0);
  });

  it('puts the scroll back on Back once the page is tall enough again', () => {
    renderHarness();
    setPageHeight(2000);
    setScrollY(600);
    click('push');
    // The page under the new entry is short, so the browser clamps to 0.
    setPageHeight(800);
    setScrollY(0);
    click('back');
    // Still loading: nothing to scroll to yet.
    act(() => vi.advanceTimersByTime(100));
    expect(scrollTo).not.toHaveBeenCalled();
    setPageHeight(2000);
    act(() => vi.advanceTimersByTime(50));
    expect(scrollTo).toHaveBeenCalledWith(0, 600);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("keeps the target when the browser's clamp to 0 fires before the restore starts", () => {
    renderHarness();
    setPageHeight(2000);
    setScrollY(600);
    click('push');
    setPageHeight(800);
    act(() => screen.getByRole('button', { name: 'back' }).click());
    // The short page clamps scroll as soon as it commits.
    setScrollY(0);
    setPageHeight(2000);
    act(() => vi.advanceTimersByTime(50));
    expect(scrollTo).toHaveBeenCalledWith(0, 600);
  });

  it('leaves a forward navigation at the top', () => {
    renderHarness();
    setPageHeight(2000);
    setScrollY(600);
    click('push');
    act(() => vi.advanceTimersByTime(100));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('gives up when the pilot scrolls before the page has grown back', () => {
    renderHarness();
    setPageHeight(2000);
    setScrollY(600);
    click('push');
    setPageHeight(800);
    setScrollY(0);
    click('back');
    act(() => {
      window.dispatchEvent(new Event('wheel'));
    });
    setPageHeight(2000);
    act(() => vi.advanceTimersByTime(100));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('gives up when the page never grows back', () => {
    renderHarness();
    setPageHeight(2000);
    setScrollY(600);
    click('push');
    setPageHeight(800);
    setScrollY(0);
    click('back');
    act(() => vi.advanceTimersByTime(POP_RESTORE_GIVE_UP_MS + 100));
    setPageHeight(2000);
    act(() => vi.advanceTimersByTime(100));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
