import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useImplantsModalUrl } from './useImplantsModalUrl';

function setup(initial: string[], index = initial.length - 1) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initial} initialIndex={index}>
      {children}
    </MemoryRouter>
  );
  return renderHook(
    () => ({ modal: useImplantsModalUrl('implants'), search: useLocation().search }),
    { wrapper }
  );
}

describe('useImplantsModalUrl', () => {
  it('opens by pushing ?implants=1 and closes by going back to where it opened', () => {
    const { result } = setup(['/fittings']);
    expect(result.current.modal.open).toBe(false);
    act(() => result.current.modal.openModal());
    expect(result.current.modal.open).toBe(true);
    expect(result.current.search).toBe('?implants=1');
    act(() => result.current.modal.closeModal());
    expect(result.current.modal.open).toBe(false);
    expect(result.current.search).toBe('');
  });

  it('closes a pasted link by clearing the param, without leaving the page', () => {
    const { result } = setup(['/other', '/fittings?implants=1&implantGoal=cpu']);
    expect(result.current.modal.open).toBe(true);
    act(() => result.current.modal.closeModal());
    expect(result.current.modal.open).toBe(false);
    expect(result.current.search).toBe('');
  });
});
