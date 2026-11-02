import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { NeedsYouItem } from './addCorpsStatus';
import { CorpStatusPanel } from './CorpStatusPanel';

const ITEMS: NeedsYouItem[] = [
  { corporationId: 1, name: 'Sable Ridge Extraction', state: 'needs-sign-in' },
  { corporationId: 2, name: 'Emberlight Group', state: 'own-book' },
  { corporationId: 3, name: 'Gantry Point Mining', state: 'needs-role' },
  { corporationId: 4, name: 'Wren Hollow Corp', state: 'gone-quiet' },
];

describe('CorpStatusPanel', () => {
  it('renders nothing when nothing needs the player', () => {
    const { container } = render(
      <CorpStatusPanel items={[]} onSignInAgain={() => {}} onRemove={() => Promise.resolve(true)} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each status with its own words and fix', async () => {
    const onSignInAgain = vi.fn();
    render(
      <CorpStatusPanel
        items={ITEMS}
        connected={8}
        total={12}
        onSignInAgain={onSignInAgain}
        onRemove={() => Promise.resolve(true)}
      />
    );
    expect(screen.getByText('Needs you (4)')).toBeInTheDocument();
    expect(screen.getByText('8 of 12 connected')).toBeInTheDocument();
    expect(screen.getByText('The EVE login did not finish.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'EVE refused the mining ledger for this character. It needs the CEO, Director or Accountant role.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Delete its book first, then connect it here.')).toBeInTheDocument();
    expect(
      screen.getByText('Removing keeps its past mining and billing records.')
    ).toBeInTheDocument();
    // The corp with its own book gets words only: no button, and never a "Move it" action.
    expect(screen.queryByRole('button', { name: /Emberlight Group/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Move it/ })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Log in again for Gantry Point Mining' })
    );
    expect(onSignInAgain).toHaveBeenCalledWith(3);
  });

  it('removes a corp that went quiet and says when that is refused', async () => {
    const onRemove = vi.fn(() => Promise.resolve(false));
    render(<CorpStatusPanel items={ITEMS} onSignInAgain={() => {}} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Wren Hollow Corp' }));
    expect(onRemove).toHaveBeenCalledWith(4);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not remove this corp');
  });
  it('shows a failed connection with its reason and Try again, not "log in again"', async () => {
    const onSignInAgain = vi.fn();
    render(
      <CorpStatusPanel
        items={[{ corporationId: 9, name: 'Dunmoor Freight', state: 'failed', reason: 'unknown' }]}
        onSignInAgain={onSignInAgain}
        onRemove={() => Promise.resolve(true)}
      />
    );
    expect(screen.getByText('Could not connect')).toBeInTheDocument();
    expect(screen.getByText(/Reason: unknown/)).toBeInTheDocument();
    expect(screen.queryByText('Needs login')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Dunmoor Freight/ }));
    expect(onSignInAgain).toHaveBeenCalledWith(9);
  });
});
