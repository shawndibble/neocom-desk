import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { openHref } from './highlightParam';
import { useOpenParam } from './useOpenParam';

function setup(entry: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ open: useOpenParam(), search: useLocation().search }), { wrapper });
}

describe('useOpenParam', () => {
  it('reads the id once and strips the param from the URL', async () => {
    const { result } = setup('/calendar?open=42&anchor=2026-10-01');
    expect(result.current.open).toBe(42);
    await waitFor(() => expect(result.current.search).toBe('?anchor=2026-10-01'));
    // Latched: the id survives the strip.
    expect(result.current.open).toBe(42);
  });

  it.each(['abc', '0', '-3', ''])('ignores a bad id (%j)', (bad) => {
    const { result } = setup(`/calendar?open=${bad}`);
    expect(result.current.open).toBeNull();
  });

  it('is null with no param', () => {
    expect(setup('/calendar').result.current.open).toBeNull();
  });
});

describe('openHref', () => {
  it('builds path?open=<id>', () => {
    expect(openHref('/market/orders', 7)).toBe('/market/orders?open=7');
  });
});
