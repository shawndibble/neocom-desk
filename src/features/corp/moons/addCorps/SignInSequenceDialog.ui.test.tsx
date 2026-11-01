import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { recordOutcome } from '@/engine/corpTaxBook/addCorpsRun';
import { freshRun, midRun } from './addCorpsFixtures';
import { SignInSequenceDialog } from './SignInSequenceDialog';

const noop = () => {};
const base = { showOutcome: true, onSignIn: () => Promise.resolve(), onStop: noop, onClose: noop };

describe('SignInSequenceDialog', () => {
  it('names the CEO to choose on EVE and the position in the run', () => {
    render(<SignInSequenceDialog run={freshRun()} {...base} />);
    expect(screen.getByRole('heading', { name: 'Logging in: corp 1 of 12' })).toBeInTheDocument();
    expect(screen.getByText('CEO of Ironvale Reach')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Log in as Kestrel Vane with EVE' })
    ).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('back from EVE: says the last corp connected and who is next', () => {
    render(<SignInSequenceDialog run={midRun()} {...base} />);
    expect(screen.getByRole('heading', { name: 'Logging in: corp 5 of 12' })).toBeInTheDocument();
    expect(
      screen.getByText('Connected Tallow Station Co. Next up is Northgate Salvage.')
    ).toBeInTheDocument();
    expect(screen.getByText('Needs login')).toBeInTheDocument();
  });

  it('wrong character: nothing connected and the same corp stays current', () => {
    const run = recordOutcome(freshRun(), { kind: 'wrong-character', signedInAs: 'Dax Orlen' });
    render(<SignInSequenceDialog run={run} {...base} />);
    expect(screen.getByRole('heading', { name: 'Logging in: corp 1 of 12' })).toBeInTheDocument();
    expect(
      screen.getByRole('alert', {
        name: '',
      })
    ).toHaveTextContent(
      'You logged in as Dax Orlen. Ironvale Reach needs Kestrel Vane. Nothing was connected'
    );
  });

  it('shows no outcome banner when reopened later', () => {
    render(<SignInSequenceDialog run={midRun()} {...base} showOutcome={false} />);
    expect(screen.queryByText(/Next up is/)).toBeNull();
  });

  it('explains a refusal with the player-facing text', () => {
    const run = recordOutcome(freshRun(), { kind: 'refused', reason: 'not-an-accountant' });
    render(<SignInSequenceDialog run={run} {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'EVE refused the mining ledger for this character.'
    );
  });

  it('leaves for EVE on the primary and stops on Stop here', async () => {
    const onSignIn = vi.fn(() => Promise.resolve());
    const onStop = vi.fn();
    render(<SignInSequenceDialog run={freshRun()} {...base} onSignIn={onSignIn} onStop={onStop} />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in as Kestrel Vane with EVE' }));
    expect(onSignIn).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Stop here' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('shows an error line when EVE cannot be opened', async () => {
    render(
      <SignInSequenceDialog
        run={freshRun()}
        {...base}
        onSignIn={() => Promise.reject(new Error('x'))}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log in as Kestrel Vane with EVE' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Could not open EVE's login");
  });
});
