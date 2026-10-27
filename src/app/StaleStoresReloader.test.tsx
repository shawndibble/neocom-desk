import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { StaleStoresReloader } from './StaleStoresReloader';
import { consumeStaleStores, markStoresStale } from './staleStoresReload';

function setup(initial = '/settings/data') {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <StaleStoresReloader />
      <Link to="/settings/display">settings display</Link>
      <Link to="/overview">overview</Link>
      <Link to="/mail">mail</Link>
      <Routes>
        <Route path="*" element={<p>page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('StaleStoresReloader', () => {
  const reload = vi.fn();

  beforeEach(() => {
    consumeStaleStores();
    reload.mockReset();
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not reload on first render, even with the flag set', () => {
    markStoresStale();
    setup();
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads on navigation when no flag is set', async () => {
    setup();
    await userEvent.click(screen.getByRole('link', { name: 'overview' }));
    await userEvent.click(screen.getByRole('link', { name: 'mail' }));
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays put across Settings sub-pages, reloads once on leaving Settings', async () => {
    setup();
    markStoresStale();
    await userEvent.click(screen.getByRole('link', { name: 'settings display' }));
    expect(reload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('link', { name: 'overview' }));
    expect(reload).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('link', { name: 'mail' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
