import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { CloseAccountDialog } from './CloseAccountDialog';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';

const editBook = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (...a: unknown[]) => editBook(...a),
  readAudit: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/features/character/useEntityName', () => ({
  useEntityName: () => 'Ore & Glory',
}));

const CORP = 98000001;
const ORE = 45490;

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 5_000_000,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [
      {
        characterId: 2,
        recordedCorporationId: 555,
        structureId: 1001,
        date: '2026-08-11',
        oreLines: [{ typeId: ORE, quantity: 2000 }],
      },
    ],
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

function renderDialog(overrides: Partial<BookViewInput> = {}) {
  const view = buildBookView(input(overrides));
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view,
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => `Corp ${id}`,
            refinery: () => 'Efa - Brass Anvil',
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: {} as BookSettings,
          data: {} as never,
          verdict,
          reload: vi.fn(),
        }}
      >
        <CloseAccountDialog
          open
          onClose={onClose}
          miner={view.miners.find((m) => m.id === 'solo:2')!}
          minerName="Pilot 2"
        />
      </BookProvider>
    </MemoryRouter>
  );
  return { onClose };
}

beforeEach(() => {
  editBook.mockReset().mockResolvedValue({});
});

describe('CloseAccountDialog', () => {
  it('shows the final Statement and closes the account with the reason', async () => {
    const { onClose } = renderDialog();
    expect(screen.getByText(/Final Statement: .* through 2026-09-17/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Close account' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Reason/), 'Left the area');
    await userEvent.click(confirm);
    expect(editBook).toHaveBeenCalledTimes(1);
    const [, , action] = editBook.mock.calls[0];
    expect(action).toMatchObject({
      action: 'closeAccount',
      minerId: 'solo:2',
      reason: 'Left the area',
      credit: { kind: 'refund' },
      statement: { id: 'final_solo:2', minerId: 'solo:2', amount: 200_000, characterIds: [2] },
    });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('offers a forfeit only when there is credit, and holds it until the basis is valid', async () => {
    renderDialog({
      payments: [
        { id: 'p', minerId: 'solo:2', amount: 1_000_000, at: '2026-09-01T00:00:00Z' } as never,
      ],
    });
    await userEvent.type(screen.getByLabelText(/Reason/), 'Left');
    await userEvent.click(screen.getByRole('button', { name: 'Forfeit' }));
    expect(screen.getByRole('button', { name: 'Close account' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Where and when/), 'Agreed in a corp mail');
    expect(screen.getByRole('button', { name: 'Close account' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
    expect(editBook.mock.calls[0][2]).toMatchObject({
      credit: { kind: 'forfeit', basis: { kind: 'consent', note: 'Agreed in a corp mail' } },
    });
  });

  it('has no forfeit choice without credit', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: 'Forfeit' })).not.toBeInTheDocument();
  });
});
