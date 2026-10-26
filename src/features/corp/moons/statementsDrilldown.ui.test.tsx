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

function renderAt(path: string) {
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
        { ...b, mailsSent: 1, remindersStopped: true } as typeof b,
      ],
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
});
