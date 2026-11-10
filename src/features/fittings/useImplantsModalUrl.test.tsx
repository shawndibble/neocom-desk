import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useImplantsModalUrl } from './useImplantsModalUrl';

function setup(initial: string[], index = initial.length - 1) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initial} initialIndex={index}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => ({
      modal: useImplantsModalUrl('implants'),
      search: useLocation().search,
      navigate: useNavigate(),
    }),
    { wrapper }
  );
}

describe('useImplantsModalUrl', () => {
  it('opens by pushing ?implants=1 and closes by clearing it', () => {
    const { result } = setup(['/fittings']);
    expect(result.current.modal.open).toBe(false);
    act(() => result.current.modal.openModal());
    expect(result.current.modal.open).toBe(true);
    expect(result.current.search).toBe('?implants=1');
    act(() => result.current.modal.closeModal());
    expect(result.current.modal.open).toBe(false);
    expect(result.current.search).toBe('');
  });

  it('closing keeps a param changed while the modal was open, rather than going Back past it', () => {
    const { result } = setup(['/fittings?tab=a']);
    act(() => result.current.modal.openModal());
    expect(result.current.search).toBe('?tab=a&implants=1');
    // The page's own URL write, carrying an old `implantsPushed` marker that must now be ignored.
    act(
      () =>
        void result.current.navigate('/fittings?tab=b&implants=1', {
          replace: true,
          state: { implantsPushed: true },
        })
    );
    act(() => result.current.modal.closeModal());
    expect(result.current.search).toBe('?tab=b');
  });

  it('closes a pasted link by clearing the param, without leaving the page', () => {
    const { result } = setup(['/other', '/fittings?implants=1&implantGoal=cpu']);
    expect(result.current.modal.open).toBe(true);
    act(() => result.current.modal.closeModal());
    expect(result.current.modal.open).toBe(false);
    expect(result.current.search).toBe('');
  });
});
