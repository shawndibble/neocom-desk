import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { AdjustmentDialog } from './CorrectionDialogs';
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
    overdueDays: 14,
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
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
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
            ownerRefinery: () => 'Efa - Brass Anvil',
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: {} as BookSettings,
          data: {} as never,
          verdict,
          reload: vi.fn(),
        }}
      >
        <AdjustmentDialog
          open
          onClose={onClose}
          miner={view.miners.find((m) => m.id === 'solo:2')!}
          minerName="Pilot 2"
          defaultDate="2026-08-11"
          openingDate="2026-08-01"
        />
      </BookProvider>
    </MemoryRouter>
  );
  return { onClose };
}

beforeEach(() => {
  editBook.mockReset().mockResolvedValue({});
});

describe('AdjustmentDialog set balance', () => {
  const credit1m = {
    payments: [
      { id: 'p', minerId: 'solo:2', amount: 1_000_000, at: '2026-09-01T00:00:00Z' } as never,
    ],
  };

  it('works out the charge that moves a Miner holding credit to the balance typed', async () => {
    renderDialog(credit1m);
    await userEvent.click(screen.getByRole('button', { name: 'Set balance' }));
    expect(screen.getByText(/Their balance now: holds .* credit\./)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Amount'), '300000');
    expect(screen.getByText(/Adds a charge of .*1,?100,?000/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Label on the line/)).toHaveValue(
      'Opening balance from the old system'
    );
    await userEvent.click(screen.getByRole('button', { name: /^Add/ }));
    expect(editBook).toHaveBeenCalledTimes(1);
    expect(editBook.mock.calls[0][2]).toMatchObject({
      action: 'addAdjustment',
      minerId: 'solo:2',
      date: '2026-08-01',
      amount: 1_100_000,
      reason: 'Opening balance from the old system',
      kind: 'opening',
    });
  });

  it('adds a credit when the balance typed is lower, and nothing when it already matches', async () => {
    renderDialog(credit1m);
    await userEvent.click(screen.getByRole('button', { name: 'Set balance' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hold credit' }));
    await userEvent.type(screen.getByLabelText('Amount'), '1500000');
    expect(screen.getByText(/Adds a credit of .*700,?000/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '800000');
    expect(screen.getByText('Their balance already matches.')).toBeInTheDocument();
  });
});
