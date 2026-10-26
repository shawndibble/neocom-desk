import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { BookProvider } from './BookContext';
import { AutomaticSyncSection } from './AutomaticSyncSection';
import type { BookContextValue } from './bookContextValue';
import type { CorpSyncCallbackState } from '../taxBook/syncGrant';

const beginCorpSyncLogin = vi.fn();
vi.mock('@/app/loginFlow', () => ({
  beginCorpSyncLogin: (...a: unknown[]) => beginCorpSyncLogin(...a),
}));
const turnOffScheduledSync = vi.fn();
vi.mock('../taxBook/syncGrant', () => ({
  turnOffScheduledSync: (...a: unknown[]) => turnOffScheduledSync(...a),
}));

const CORP = 98000001;
const ME = 7;
const NOW = Date.now();

const status = (over: Partial<ScheduledSyncStatus> = {}): ScheduledSyncStatus => ({
  status: 'active',
  characterId: ME,
  characterName: 'Pilot 7',
  enabledAt: NOW - 86_400_000,
  ...over,
});

function renderSection(
  scheduled: ScheduledSyncStatus | null,
  over: { isCeo?: boolean; canEdit?: boolean; state?: CorpSyncCallbackState } = {}
) {
  const reload = vi.fn();
  render(
    <MemoryRouter initialEntries={[{ pathname: '/corp/moons', state: over.state }]}>
      <BookProvider
        value={
          {
            characterId: ME,
            corporationId: CORP,
            names: { character: (id: number) => `Pilot ${id}` },
            data: { scheduledSync: scheduled },
            verdict: { isCeo: over.isCeo ?? false, canEdit: over.canEdit ?? true },
            reload,
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <AutomaticSyncSection />
      </BookProvider>
    </MemoryRouter>
  );
  return { reload };
}

beforeEach(() => {
  beginCorpSyncLogin.mockReset().mockResolvedValue(undefined);
  turnOffScheduledSync.mockReset().mockResolvedValue(true);
});

describe('AutomaticSyncSection', () => {
  it('is off by default and starts the opt-in for the active Character', async () => {
    renderSection(null);
    expect(screen.getByTestId('auto-sync-state')).toHaveTextContent(/^Off/);
    expect(screen.getByText(/never issues a Statement and never sends mail/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn on for Pilot 7' }));
    expect(beginCorpSyncLogin).toHaveBeenCalledWith(ME, CORP);
  });

  it('shows who holds it and when it last ran, and lets the holder turn it off', async () => {
    const { reload } = renderSection(
      status({
        lastRun: {
          at: NOW - 3_600_000,
          outcome: 'synced',
          observedRows: 12,
          donationsAdded: 2,
          settled: 1,
        },
      })
    );
    expect(screen.getByTestId('auto-sync-state')).toHaveTextContent('On, held by Pilot 7.');
    expect(
      screen.getByText(/12 ledger rows, 2 new donations, 1 Statements settled/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Turn on/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(turnOffScheduledSync).toHaveBeenCalledWith({
      characterId: ME,
      corporationId: CORP,
      asCeo: false,
    });
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it("lets another editor replace someone else's, but only the CEO revoke it", async () => {
    renderSection(status({ characterId: 9, characterName: 'Pilot 9' }));
    expect(screen.getByText(/replaces the current holder/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on for Pilot 7' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument();
  });

  it('lets the CEO revoke the holder with a live role check', async () => {
    renderSection(status({ characterId: 9, characterName: 'Pilot 9' }), { isCeo: true });
    await userEvent.click(screen.getByRole('button', { name: "Revoke Pilot 9's grant" }));
    expect(turnOffScheduledSync).toHaveBeenCalledWith({
      characterId: ME,
      corporationId: CORP,
      asCeo: true,
    });
  });

  it('says why a stopped schedule stopped and offers to turn it on again', () => {
    renderSection(
      status({
        status: 'stopped',
        stoppedReason: 'role-lost',
        characterId: 9,
        characterName: 'Pilot 9',
      })
    );
    expect(screen.getByTestId('auto-sync-state')).toHaveTextContent(
      'Stopped: Pilot 9 no longer has the Accountant, Director or CEO role.'
    );
    expect(screen.getByRole('button', { name: 'Turn on for Pilot 7' })).toBeInTheDocument();
  });

  it('only offers the opt-in to a book editor', () => {
    renderSection(null, { canEdit: false });
    expect(screen.queryByRole('button', { name: /Turn on/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Only a CEO, Director or Accountant/)).toBeInTheDocument();
  });

  it('words what came back from EVE, and reloads the book', async () => {
    const { reload } = renderSection(null, {
      state: {
        corpSyncGrant: {
          status: 'mismatch',
          expectedCharacterId: ME,
          authorizedCharacterId: 8,
          authorizedName: 'Pilot 8',
        },
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      "You authorized Pilot 8, but this book's active Character is Pilot 7. Nothing was turned on."
    );
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('words a refusal by the server', () => {
    renderSection(null, {
      state: { corpSyncGrant: { status: 'failed', characterId: ME, reason: 'not-an-editor' } },
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Only a CEO, Director or Accountant can turn on Automatic sync.'
    );
  });
});
