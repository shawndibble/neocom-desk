import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import '@/i18n';
import { Modal } from '@/components/ui/Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  return (
    <>
      <p data-testid="where">{pathname + search}</p>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button" onClick={() => void navigate('/overview?info=x')}>
        Same page
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Layer">
        <button type="button" onClick={() => void navigate('/overview?info=x')}>
          Param inside
        </button>
        <button type="button" onClick={() => void navigate('/market')}>
          Leave page
        </button>
      </Modal>
    </>
  );
}

describe('useOverlayHistory', () => {
  it('keeps a search-param push real: Back removes it and the overlay stays open', async () => {
    window.history.replaceState(null, '', '/overview');
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Param inside' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/overview?info=x');
    expect(screen.getByRole('dialog', { name: 'Layer' })).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/overview$/));
    expect(screen.getByRole('dialog', { name: 'Layer' })).toBeInTheDocument();
  });

  it('replaces its entry on a pathname change, keeping the router idx', async () => {
    window.history.replaceState({ idx: 4, key: 'k', usr: null }, '', '/overview');
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const entries = window.history.length;
    await user.click(screen.getByRole('button', { name: 'Leave page' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/market');
    // Replaced, not stacked.
    expect(window.history.length).toBe(entries);
    const state = window.history.state as Record<string, unknown>;
    expect(state).not.toHaveProperty('__neocomOverlay');
    expect(state.idx).toBe(4);
  });

  it('restores history.pushState once the last overlay is gone', async () => {
    const original = window.history.pushState;
    const user = userEvent.setup();
    const view = render(
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(window.history.pushState).not.toBe(original);
    view.unmount();
    expect(window.history.pushState).toBe(original);
  });
});
