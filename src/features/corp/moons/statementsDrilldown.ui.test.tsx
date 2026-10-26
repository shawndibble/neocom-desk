import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
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
import { StatementPeriodDetail } from './StatementPeriodDetail';
import { enqueueReminder } from '@/features/corpTaxBook/mailQueue';
import { StatementsTab } from './StatementsTab';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';

vi.mock('../taxBook/bookClient', () => ({
  editBook: vi.fn(),
  readAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/corpTaxBook/mailQueue', () => ({
  enqueueStatements: vi.fn(),
  enqueueReminder: vi.fn(),
}));
vi.mock('@/features/character/useEntityName', () => ({ useEntityName: () => 'Ore & Glory' }));

const CORP = 98000001;
const ORE = 45490;
const entry = (characterId: number, date: string, quantity: number): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: CORP,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-30T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-30T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry(1, '2026-08-10', 1000), entry(2, '2026-08-11', 2000)],
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

function PeriodRoute() {
  return <StatementPeriodDetail periodStart={useParams().start ?? ''} />;
}

function renderAt(path: string, opts: { settleFirst?: boolean } = {}) {
  const first = buildBookView(input());
  const plan = planStatementRun(first, nextRunPeriod(first)!);
  const [a, b] = plan.lines.map((l) => ({
    ...statementForLine(first, plan, l),
    issuedAt: '2026-09-01T00:00:00Z',
  }));
  const view = buildBookView(
    input({
      statements: [
        { ...a, mailsSent: 2 } as typeof a,
        { ...b, mailsSent: 1, remindersStopped: true, manualRemindersSent: 1 } as typeof b,
      ],
      ...(opts.settleFirst
        ? {
            payments: [
              {
                id: 'p1',
                minerId: a.minerId,
                characterId: 1,
                amount: a.amount,
                at: '2026-09-02T00:00:00Z',
                source: 'manual' as const,
                statementId: a.id,
              },
            ],
          }
        : {}),
    })
  );
  render(
    <MemoryRouter initialEntries={[path]}>
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
          reload: vi.fn(),
        }}
      >
        <Routes>
          <Route path="/corp/moons/statements" element={<StatementsTab />} />
          <Route path="/corp/moons/statements/:start" element={<PeriodRoute />} />
        </Routes>
      </BookProvider>
    </MemoryRouter>
  );
}

describe('Statements drill-down (#5285)', () => {
  it('an issued period row shows Mailed n/N and opens its period page', async () => {
    renderAt('/corp/moons/statements');
    const table = screen.getByRole('table', { name: 'All periods' });
    const row = within(table).getByText('Aug 2026').closest('tr')!;
    expect(within(row).getByText('2/2')).toBeInTheDocument();
    await userEvent.click(within(row).getByText('Aug 2026'));
    expect(await screen.findByRole('table', { name: 'Statements' })).toBeInTheDocument();
  });

  it('open and ready rows do not click through', async () => {
    renderAt('/corp/moons/statements');
    const table = screen.getByRole('table', { name: 'All periods' });
    const sep = within(table).getByText('Sep 2026').closest('tr')!;
    await userEvent.click(within(sep).getByText('Sep 2026'));
    expect(screen.getByRole('table', { name: 'All periods' })).toBeInTheDocument();
  });

  it('the period page lists each miner with mail state; Stopped hides the sent mark', () => {
    renderAt('/corp/moons/statements/2026-08-01');
    const table = screen.getByRole('table', { name: 'Statements' });
    expect(within(table).getByText('Pilot 1')).toBeInTheDocument();
    expect(within(table).getByText('Pilot 2')).toBeInTheDocument();
    expect(within(table).getByText('Sent ×2')).toBeInTheDocument();
    expect(within(table).getByText('Stopped')).toBeInTheDocument();
    expect(within(table).getAllByText(/days late/).length).toBeGreaterThan(0);
  });

  it('a period without Statements says so', () => {
    renderAt('/corp/moons/statements/2020-01-01');
    expect(screen.getByText('No Statements were issued for this period.')).toBeInTheDocument();
  });

  describe('row actions (#5287)', () => {
    async function openMenu(name: string) {
      const table = screen.getByRole('table', { name: 'Statements' });
      const row = within(table).getByText(name).closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: /actions/i }));
    }

    it("Send reminder targets that row's Statement", async () => {
      vi.mocked(enqueueReminder).mockResolvedValue({ ok: true } as never);
      renderAt('/corp/moons/statements/2026-08-01');
      await openMenu('Pilot 1');
      await userEvent.click(await screen.findByRole('menuitem', { name: /Send reminder/ }));
      expect(enqueueReminder).toHaveBeenCalledTimes(1);
      const arg = vi.mocked(enqueueReminder).mock.calls[0]![0];
      expect(arg.statement.recipientId).toBe(1);
    });

    it('Send reminder is disabled with the reason once the one reminder is sent', async () => {
      vi.mocked(enqueueReminder).mockClear();
      renderAt('/corp/moons/statements/2026-08-01');
      await openMenu('Pilot 2');
      const item = await screen.findByRole('menuitem', { name: /Send reminder/ });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('One reminder already sent');
      await userEvent.click(item);
      expect(enqueueReminder).not.toHaveBeenCalled();
    });

    it('Send reminder is disabled on a settled Statement; Record payment stays with a hint', async () => {
      renderAt('/corp/moons/statements/2026-08-01', { settleFirst: true });
      await openMenu('Pilot 1');
      const remind = await screen.findByRole('menuitem', { name: /Send reminder/ });
      expect(remind).toHaveAttribute('aria-disabled', 'true');
      expect(remind).toHaveTextContent('Statement already paid');
      const record = screen.getByRole('menuitem', { name: /Record payment/ });
      expect(record).not.toHaveAttribute('aria-disabled', 'true');
      expect(record).toHaveTextContent('Statement already paid');
    });

    it('Record payment opens the dialog for that Statement', async () => {
      renderAt('/corp/moons/statements/2026-08-01');
      await openMenu('Pilot 1');
      await userEvent.click(await screen.findByRole('menuitem', { name: /Record payment/ }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });
});
