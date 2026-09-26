import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate, type NavigateFunction } from 'react-router-dom';
import {
  FIRST_SCREEN_PATHNAME_KEY,
  hasLeftFirstScreen,
  recordFirstScreenPathname,
  useHasLeftFirstScreen,
} from './firstScreen';

beforeEach(() => {
  sessionStorage.clear();
});

describe('hasLeftFirstScreen', () => {
  it('is false until a first pathname has been recorded', () => {
    expect(hasLeftFirstScreen(null, '/characters')).toBe(false);
  });

  it('is false while still on the recorded first pathname', () => {
    expect(hasLeftFirstScreen('/characters', '/characters')).toBe(false);
  });

  it('is true once the pathname differs from the recorded first one', () => {
    expect(hasLeftFirstScreen('/characters', '/plans')).toBe(true);
  });
});

describe('recordFirstScreenPathname', () => {
  it('remembers the first pathname it sees for this session', () => {
    expect(recordFirstScreenPathname('/characters')).toBe('/characters');
    expect(sessionStorage.getItem(FIRST_SCREEN_PATHNAME_KEY)).toBe('/characters');
  });

  it('keeps the first pathname across later calls, even with a different one', () => {
    recordFirstScreenPathname('/characters');
    expect(recordFirstScreenPathname('/plans')).toBe('/characters');
  });
});

function renderAt(initialPath: string) {
  const navigateRef: { current: NavigateFunction | null } = { current: null };
  function Probe() {
    navigateRef.current = useNavigate();
    return null;
  }
  const result = renderHook(() => useHasLeftFirstScreen(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <Probe />
                {children}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    ),
  });
  return { ...result, navigate: () => navigateRef.current };
}

describe('useHasLeftFirstScreen', () => {
  it('is false on the very first screen', () => {
    const { result } = renderAt('/characters');
    expect(result.current).toBe(false);
  });

  it('becomes true once the player has navigated to a second route', () => {
    const { result, rerender, navigate } = renderAt('/characters');
    expect(result.current).toBe(false);

    navigate()?.('/plans');
    rerender();

    expect(result.current).toBe(true);
  });

  it('stays false navigating back to the same first route', () => {
    const { result, rerender, navigate } = renderAt('/characters');
    navigate()?.('/characters');
    rerender();
    expect(result.current).toBe(false);
  });
});
