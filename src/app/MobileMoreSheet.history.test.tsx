import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { MobileMoreSheet } from './MobileMoreSheet';

vi.mock('@/features/corp/useCorpNavVisible', () => ({ useCorpNavVisible: () => false }));
vi.mock('@/features/corp/useCorpAccess', () => ({
  useCorpAccess: () => ({ state: 'none', capabilities: {} }),
}));

const NO_LOCKS = new Set<never>();

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <BrowserRouter>
      <button type="button" onClick={() => setOpen(true)}>
        Open More
      </button>
      <Where />
      <MobileMoreSheet
        open={open}
        onClose={() => setOpen(false)}
        locked={NO_LOCKS}
        tabs={[]}
        renderCharacterLink={() => null}
      />
    </BrowserRouter>
  );
}

describe('MobileMoreSheet history', () => {
  it('replaces its own history entry when a tile navigates, so Back returns to the page under it', async () => {
    window.history.replaceState(null, '', '/overview');
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open More' }));
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/settings');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The sheet's own entry was replaced, not left behind.
    expect(window.history.state).not.toHaveProperty('__neocomOverlay');

    // A single Back reaches the page the sheet was opened over.
    window.history.back();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/overview'));
    // Landed on the original entry, not a dead one the overlay left behind.
    expect(window.history.state).not.toHaveProperty('__neocomOverlay');
  });
});
