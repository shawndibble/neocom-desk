import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import {
  buildBookView,
  nextRunPeriod,
  planStatementRun,
  statementForLine,
  type BookViewInput,
} from '@/engine/corpTaxBook/bookView';
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

const corpName = vi.hoisted(() => ({ value: 'Ore & Glory' as string | null }));
vi.mock('@/features/character/useEntityName', () => ({
  useEntityName: () => corpName.value,
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
  const { unmount } = render(
    <MemoryRouter initialEntries={['/corp/moons/miners']}>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view,
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => `Corp ${id}`,
            refinery: () => 'Efa - Brass Anvil',
            ownerRefinery: () => 'Efa - Brass Anvil',
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
  return { view, reload, unmount };
}

beforeEach(() => {
  corpName.value = 'Ore & Glory';
  editBook.mockReset().mockResolvedValue({});
  enqueueStatements.mockReset().mockResolvedValue({ queued: 1, skipped: 0, missingLink: [] });
});

describe('MinersTab', () => {
  it('lists members and non-members by default; turning Non-members off says what is hidden (CX-36)', async () => {
    renderBook(<MinersTab />);
    const table = screen.getByRole('table', { name: 'Miners' });
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
    expect(within(table).getByText('Pilot 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Non-members/ }));
    expect(within(table).queryByText('Pilot 2')).not.toBeInTheDocument();
    expect(screen.getByText(/1 non-member hidden · .* owed/)).toBeInTheDocument();
  });

  it('the row ⋮ offers the actions the Miner page holds; Send reminder says why it is inert', async () => {
    renderBook(<MinersTab />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    const menu = await screen.findByRole('menu');
    for (const name of ['Record payment…', 'Dismiss tax…', 'Show info']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
    // No Statement issued in this book: the item stays, inert.
    expect(within(menu).getByRole('menuitem', { name: 'Send reminder' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

describe('MinersTab row menu dialogs', () => {
  it('Record payment… and Dismiss tax… open their dialogs from the ⋮', async () => {
    renderBook(<MinersTab />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Record payment…' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pilot 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Dismiss tax…' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('StatementRun', () => {
  it('keeps Send disabled until the corporation name resolves, then previews with it', async () => {
    corpName.value = null;
    const first = renderBook(<StatementRun />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByText('Loading corporation name…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send 2 Statements' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview mail' })).toBeDisabled();
    expect(editBook).not.toHaveBeenCalled();
    first.unmount();

    corpName.value = 'Ore & Glory';
    renderBook(<StatementRun />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    expect(screen.getByRole('button', { name: 'Send 2 Statements' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText(/Ore & Glory moon tax Statement, Aug 2026/)).toBeInTheDocument();
  });

  it('previews the mail of each Miner from the Send step, before sending', async () => {
    renderBook(<StatementRun />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to send' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next Miner' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(enqueueStatements).not.toHaveBeenCalled();
  });

  it('previews the mail of an earlier issued Statement the run will still send', async () => {
    const first = buildBookView(input());
    const plan = planStatementRun(first, nextRunPeriod(first)!);
    const issued = plan.lines.map((l) => statementForLine(first, plan, l));
    renderBook(<StatementRun />, { statements: issued });
    expect(screen.getByText('2 to send')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preview mail' }));
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/moon tax Statement, Aug 2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next Miner' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
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
