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
      </Modal>
    </>
  );
}

describe('useOverlayHistory same-page pushes', () => {
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
});
