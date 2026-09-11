import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { PageTransitionOutlet } from './PageTransitionOutlet';

// jsdom has no `document.startViewTransition`, so these exercise the
// fallback path (an immediate swap) — the browser-only animated path isn't
// something a DOM test can observe anyway; it only changes *when* the same
// state update lands, not what it lands as.

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <Routes>
        <Route
          element={
            <div>
              <Link to="/a">Go A</Link>
              <Link to="/b">Go B</Link>
              <Link to="/a?x=1">Go A with query</Link>
              <PageTransitionOutlet />
            </div>
          }
        >
          <Route path="/a" element={<div>page A</div>} />
          <Route path="/b" element={<div>page B</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('PageTransitionOutlet', () => {
  it('renders the initial route', () => {
    renderApp();
    expect(screen.getByText('page A')).toBeInTheDocument();
  });

  it('swaps to the new route on navigation', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText('Go B'));
    await waitFor(() => expect(screen.getByText('page B')).toBeInTheDocument());
  });

  it('updates in place when only the search string changes', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText('Go A with query'));
    await waitFor(() => expect(screen.getByText('page A')).toBeInTheDocument());
  });
});
