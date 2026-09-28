import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useCompareCodes } from './compareUrl';

function wrapperAt(url: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  };
}

function useCodesAndNavigate() {
  const [codes, setCodes] = useCompareCodes();
  return { codes, setCodes, navigate: useNavigate() };
}

describe('useCompareCodes', () => {
  // The router commits a location change inside a transition, so a second add can run before the
  // first one has rendered — it must still build on it rather than on the codes last rendered.
  it('an updater builds on a write that has not rendered yet', () => {
    const { result } = renderHook(() => useCompareCodes(), {
      wrapper: wrapperAt('/compare'),
    });
    const setCodes = result.current[1];
    act(() => {
      setCodes((prev) => [...prev, 'a']);
      setCodes((prev) => [...prev, 'b']);
    });
    expect(result.current[0]).toEqual(['a', 'b']);
  });

  it('an updater starts from the codes already in the URL', () => {
    const { result } = renderHook(() => useCompareCodes(), {
      wrapper: wrapperAt('/compare?f=a&f=b'),
    });
    act(() => result.current[1]((prev) => prev.filter((code) => code !== 'a')));
    expect(result.current[0]).toEqual(['b']);
  });

  it('follows a navigation that changes the codes (Back/Forward) before the next update', () => {
    const { result } = renderHook(() => useCodesAndNavigate(), {
      wrapper: wrapperAt('/compare?f=a'),
    });
    act(() => result.current.setCodes((prev) => [...prev, 'b']));
    expect(result.current.codes).toEqual(['a', 'b']);
    act(() => result.current.navigate('/compare?f=x'));
    act(() => result.current.setCodes((prev) => [...prev, 'y']));
    expect(result.current.codes).toEqual(['x', 'y']);
  });

  it('still takes a plain list', () => {
    const { result } = renderHook(() => useCompareCodes(), {
      wrapper: wrapperAt('/compare?f=a'),
    });
    act(() => result.current[1](['c']));
    expect(result.current[0]).toEqual(['c']);
  });
});
