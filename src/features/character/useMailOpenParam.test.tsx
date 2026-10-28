import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
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
});
