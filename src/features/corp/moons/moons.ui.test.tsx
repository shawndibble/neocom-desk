import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import { BookProvider } from './BookContext';
import { MinersTab } from './MinersTab';
import { StatementRun } from './StatementRun';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';

const editBook = vi.fn();
const enqueueStatements = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (...a: unknown[]) => editBook(...a),
  readAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/corpTaxBook/mailQueue', () => ({
  enqueueStatements: (...a: unknown[]) => enqueueStatements(...a),
  enqueueReminder: vi.fn(),
}));

const CORP = 98000001;
const ORE = 45490;
const entry = (
  characterId: number,
  date: string,
  quantity: number,
  corp = CORP
): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: corp,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-11', 2000, 555)],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
    ...overrides,
  };
}

const verdict: OfficerVerdict = {
  corporationId: CORP,
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

function renderBook(ui: ReactElement, overrides: Partial<BookViewInput> = {}) {
  const view = buildBookView(input(overrides));
  const reload = vi.fn();
  render(
    <MemoryRouter initialEntries={['/corp/moons/miners']}>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view,
          names: {
            character: (id) => `Pilot ${id}`,
            refinery: () => 'Efa - Brass Anvil',
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: { minimumStatement: 0 } as BookSettings,
          data: {} as never,
          verdict,
          reload,
        }}
      >
        {ui}
      </BookProvider>
    </MemoryRouter>
  );
  return { view, reload };
}

beforeEach(() => {
  editBook.mockReset().mockResolvedValue({});
  enqueueStatements.mockReset().mockResolvedValue({ queued: 1, skipped: 0, missingLink: [] });
});

describe('MinersTab', () => {
  it('lists members by default and brings guests in with the Non-members filter', async () => {
    renderBook(<MinersTab />);
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
    expect(within(table).queryByText('Pilot 2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Non-members/ }));
    expect(await screen.findByText('Pilot 2')).toBeInTheDocument();
  });
});

describe('StatementRun', () => {
  it('previews the mail of each Miner from the Send step, before sending', async () => {
    renderBook(<StatementRun />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next Miner' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(enqueueStatements).not.toHaveBeenCalled();
  });

  it('checks, then issues each Statement before handing the mails to the queue', async () => {
    const { reload } = renderBook(<StatementRun />);
    expect(screen.getByText('Aug 2026 Statements')).toBeInTheDocument();
    expect(screen.getByText('2 to send')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByText(/about \d+ minute/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 Statements' }));

    await waitFor(() => expect(enqueueStatements).toHaveBeenCalledTimes(1));
    const issued = editBook.mock.calls.map((c) => (c[2] as { action: string }).action);
    expect(issued).toEqual(['issueStatement', 'issueStatement']);
    const stored = editBook.mock.calls[0][2] as {
      statement: { minerName: string; refineryNames: Record<string, string> };
    };
    expect(stored.statement.minerName).toMatch(/^Pilot \d$/);
    expect(stored.statement.refineryNames).toEqual({ '1001': 'Efa - Brass Anvil' });
    const [{ statements, corporationId, senderCharacterId }] = enqueueStatements.mock.calls[0];
    expect(corporationId).toBe(CORP);
    expect(senderCharacterId).toBe(7);
    expect(statements.map((s: { amountDue: number }) => s.amountDue).sort()).toEqual([
      100_000, 200_000,
    ]);
    expect(await screen.findByText('1 Statement is in the send queue.')).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it('shows a refused issue instead of queueing mail', async () => {
    editBook.mockRejectedValueOnce(new Error('An issued Statement never changes'));
    renderBook(<StatementRun />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send 2 Statements' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An issued Statement never changes');
    expect(enqueueStatements).not.toHaveBeenCalled();
  });
});
