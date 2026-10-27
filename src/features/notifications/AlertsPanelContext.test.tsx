import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useContext } from 'react';
import '@/i18n';
import { AlertsPanelContext } from '@/components/ui/alertsPanelContext';
import { AlertsPanelProvider } from './AlertsPanelContext';

vi.mock('./AlertsPanel', () => ({
  AlertsPanel: ({ variant }: { variant: string }) => <p>panel {variant}</p>,
}));

function Probe() {
  const { open, setOpen, renderPanel } = useContext(AlertsPanelContext);
  const location = useLocation();
  return (
    <>
      <output data-testid="open">{String(open)}</output>
      <output data-testid="search">{location.search}</output>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        close
      </button>
      {open && renderPanel?.({ variant: 'popover', onClose: () => setOpen(false) })}
    </>
  );
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AlertsPanelProvider>
        <Probe />
      </AlertsPanelProvider>
    </MemoryRouter>
  );
}

describe('AlertsPanelProvider', () => {
  it('starts closed and opens on request, drawing the injected panel', async () => {
    renderAt('/overview');
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(await screen.findByText('panel popover')).toBeInTheDocument();
  });

  it('opens from ?alerts=1 on the Overview, keeps the other params, and closing drops it', async () => {
    renderAt('/overview?alerts=1&character=7');
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('search')).toHaveTextContent('?alerts=1&character=7');
    await userEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() => expect(screen.getByTestId('open')).toHaveTextContent('false'));
    expect(screen.getByTestId('search')).toHaveTextContent('?character=7');
  });

  it('ignores ?alerts=1 off the Overview', () => {
    renderAt('/market?alerts=1');
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });
});
