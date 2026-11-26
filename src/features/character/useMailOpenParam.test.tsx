import { act, renderHook, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useLayoutEffect, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { mailOpenHref } from '@/lib/highlightParam';
import { useMailOpenParam } from './useMailOpenParam';

function setup(entry: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ target: useMailOpenParam(), search: useLocation().search }), {
    wrapper,
  });
}

describe('useMailOpenParam', () => {
  it('reads mail and owner once, then strips both', async () => {
    const { result } = setup(mailOpenHref(7, 91) + '&scope=all');
    expect(result.current.target).toEqual({ mailId: 7, ownerId: 91 });
    await waitFor(() => expect(result.current.search).toBe('?scope=all'));
    expect(result.current.target).toEqual({ mailId: 7, ownerId: 91 });
  });

  it('owner is optional', () => {
    expect(setup('/mail?open=7').result.current.target).toEqual({ mailId: 7, ownerId: null });
  });

  it('is null without a mail id', () => {
    expect(setup('/mail?owner=91').result.current.target).toBeNull();
  });

  it('never rewrites the URL after the mount-time strip', () => {
    window.history.replaceState(null, '', '/mail');
    const { result } = renderHook(
      () => {
        const { search } = useLocation();
        useLayoutEffect(() => {
          if (search === '?search=fleet')
            window.history.replaceState(null, '', '/mail?search=fleet&hideRead=1');
        }, [search]);
        return { target: useMailOpenParam(), navigate: useNavigate() };
      },
      { wrapper: BrowserRouter }
    );
    expect(result.current.target).toBeNull();
    act(() => result.current.navigate('/mail?search=fleet', { replace: true }));
    expect(window.location.search).toBe('?search=fleet&hideRead=1');
  });
});
