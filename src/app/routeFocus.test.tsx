import { useRef, type ReactNode } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { HEADING_WAIT_MS, focusKeyFor, useRouteFocus } from './routeFocus';

describe('focusKeyFor', () => {
  it('collapses a tabbed page’s tabs to the page', () => {
    expect(focusKeyFor('/market/orders')).toBe('/market');
    expect(focusKeyFor('/market/appraisal')).toBe('/market');
  });

  it('treats a splat drill-down as the same page', () => {
    expect(focusKeyFor('/assets/60003760')).toBe('/assets');
    expect(focusKeyFor('/assets')).toBe('/assets');
    expect(focusKeyFor('/corp/assets/1/2')).toBe('/corp/assets');
  });

  it('keeps a :param route one page across its params, apart from its list', () => {
    expect(focusKeyFor('/skills/plans/1')).toBe(focusKeyFor('/skills/plans/2'));
    expect(focusKeyFor('/skills/plans/1')).not.toBe(focusKeyFor('/skills/plans'));
  });
});

function Shell() {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useRouteFocus(ref, location.pathname, location.hash);
  return (
    <>
      <nav>
        <Link to="/overview">overview</Link>
        <Link to="/mail">mail</Link>
        <Link to="/market/orders">orders tab</Link>
        <Link to="/assets/60003760">drill down</Link>
        <Link to="/settings/general#shortcuts">shortcuts</Link>
        <Link to="/calendar">calendar</Link>
      </nav>
      <div ref={ref} tabIndex={-1} data-testid="outlet">
        <Outlet />
      </div>
    </>
  );
}

function renderShell(initial: string, extraRoutes: ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/overview" element={<h1>Overview</h1>} />
          <Route path="/mail" element={<h1>Mail</h1>} />
          <Route path="/market/*" element={<h1>Market</h1>} />
          <Route path="/assets/*" element={<h1>Assets</h1>} />
          <Route path="/settings/*" element={<h1>Settings</h1>} />
          {extraRoutes}
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('useRouteFocus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not move focus on first load', () => {
    renderShell('/overview');
    expect(document.activeElement).toBe(document.body);
  });

  it('focuses the new page’s h1 after navigating', async () => {
    renderShell('/overview');
    await userEvent.click(screen.getByRole('link', { name: 'mail' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Mail' }));
  });

  it('leaves focus alone on a tab switch within the page', async () => {
    renderShell('/market/browser');
    const link = screen.getByRole('link', { name: 'orders tab' });
    await userEvent.click(link);
    expect(document.activeElement).toBe(link);
  });

  it('leaves focus alone on a drill-down within the page', async () => {
    renderShell('/assets');
    const link = screen.getByRole('link', { name: 'drill down' });
    await userEvent.click(link);
    expect(document.activeElement).toBe(link);
  });

  it('leaves focus to a hash target', async () => {
    renderShell('/overview');
    const link = screen.getByRole('link', { name: 'shortcuts' });
    await userEvent.click(link);
    expect(document.activeElement).toBe(link);
  });

  it('waits for a heading that renders late, then focuses the page if none comes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderShell('/overview', <Route path="/calendar" element={<p>no heading yet</p>} />);
    await userEvent.click(screen.getByRole('link', { name: 'calendar' }));
    expect(document.activeElement).not.toBe(screen.getByTestId('outlet'));

    act(() => {
      vi.advanceTimersByTime(HEADING_WAIT_MS);
    });

    expect(document.activeElement).toBe(screen.getByTestId('outlet'));
  });
});
