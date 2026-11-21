import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, minerDetail, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { BookProvider } from './BookContext';
import { AccountLedger } from './AccountLedger';
import { EditCorrectionDialog, MarketAdjustmentDialog } from './CorrectionDialogs';
import type { LedgerActions } from './LedgerRowMenu';
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

const verdictNoEdit = { ...verdict, canEdit: false };

const correction: Adjustment = {
  id: 'c1',
  minerId: 'solo:2',
  date: '2026-08-11',
  amount: 50_000,
  reason: 'Auth rollover',
  by: 7,
  at: '2026-09-01T10:00:00Z',
};

function running(overrides: Partial<BookViewInput> = {}) {
  return buildBookView(
    input({
      // The day is 200,000; 199,000 paid is within the book's tolerance.
      payments: [
        {
          id: 'p1',
          minerId: 'solo:2',
          characterId: 2,
          amount: 199_000,
          at: '2026-08-12T10:00:00Z',
          source: 'donation',
        } as never,
      ],
      ...overrides,
    })
  );
}

function renderLedger(view = running(), canEdit = true, corrections: Adjustment[] = [correction]) {
  const calls: string[] = [];
  const actions: LedgerActions = {
    editCorrection: (id) => calls.push(`edit:${id}`),
    reverseCorrection: (id) => calls.push(`reverse:${id}`),
    reverseWriteOff: (id) => calls.push(`reverseWriteOff:${id}`),
    chargeShortfall: (e) => calls.push(`charge:${e.forDate}`),
    changeForgiven: (e) => calls.push(`forgiven:${e.forDate}`),
    markNotTax: (id) => calls.push(`notTax:${id}`),
    changeRate: (key) => calls.push(`rate:${key}`),
    dismissDays: (keys) => calls.push(`dismiss:${keys.length}`),
  };
  const detail = minerDetail(view, 'solo:2')!;
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
          verdict: canEdit ? verdict : verdictNoEdit,
          reload: vi.fn(),
        }}
      >
        <AccountLedger detail={detail} corrections={corrections} phone={false} actions={actions} />
      </BookProvider>
    </MemoryRouter>
  );
  return calls;
}

const rowOf = (text: RegExp) => screen.getByText(text).closest('tr')!;

beforeEach(() => {
  editBook.mockReset().mockResolvedValue({});
});

describe('the account ledger row menus', () => {
  it('offers edit and reverse on a correction, and reverse opens the dialog it names', async () => {
    const calls = renderLedger(running({ adjustments: [correction] }));
    fireEvent.contextMenu(rowOf(/Correction: Auth rollover/));
    expect(await screen.findByRole('menuitem', { name: 'Edit correction' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reverse correction' }));
    await vi.waitFor(() => expect(calls).toEqual(['reverse:c1']));
  });

  it('offers charge and change on a Market adjustment, and nothing on a reversed row', async () => {
    const reversed: Adjustment = {
      ...correction,
      reversed: { by: 7, at: '2026-09-02T10:00:00Z', reason: 'Entered twice' },
    };
    const calls = renderLedger(running({ adjustments: [reversed] }), true, [reversed]);
    fireEvent.contextMenu(rowOf(/Market adjustment/));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Charge this shortfall' }));
    await vi.waitFor(() => expect(calls).toEqual(['charge:2026-08-11']));
    // The struck-through original and its reversal carry no menu.
    expect(screen.getByText('reversed')).toBeInTheDocument();
    fireEvent.contextMenu(rowOf(/Reversal: Entered twice/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('offers a mined day only what its status allows: a paid day can be repriced, not dismissed', async () => {
    const calls = renderLedger(running());
    fireEvent.contextMenu(rowOf(/^Moon mining/));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change rate' }));
    await vi.waitFor(() => expect(calls[0]).toMatch(/^rate:/));
    expect(screen.queryByRole('menuitem', { name: 'Dismiss tax' })).toBeNull();
  });

  it('has no menu without edit rights', () => {
    renderLedger(running({ adjustments: [correction] }), false);
    fireEvent.contextMenu(rowOf(/Correction: Auth rollover/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});

function renderWith(node: React.ReactNode) {
  const view = running();
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
        {node}
      </BookProvider>
    </MemoryRouter>
  );
}

describe('the correction dialogs', () => {
  it('edits a correction as a reversal plus the new line', async () => {
    renderWith(
      <EditCorrectionDialog open onClose={vi.fn()} adjustment={correction} minerName="Pilot 2" />
    );
    const amount = screen.getByLabelText('Amount');
    await userEvent.clear(amount);
    await userEvent.type(amount, '75000');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(editBook.mock.calls[0][2]).toMatchObject({
      action: 'editAdjustment',
      adjustmentId: 'c1',
      date: '2026-08-11',
      amount: 75_000,
      reason: 'Auth rollover',
    });
  });

  it('sets what a day may forgive, with a reason', async () => {
    renderWith(
      <MarketAdjustmentDialog
        open
        onClose={vi.fn()}
        minerId="solo:2"
        date="2026-08-11"
        forgiven={1_000}
      />
    );
    const confirm = screen.getByRole('button', { name: 'Save' });
    expect(confirm).toBeDisabled();
    const amount = screen.getByLabelText('Forgive up to');
    await userEvent.clear(amount);
    await userEvent.type(amount, '400');
    await userEvent.type(screen.getByLabelText('Why'), 'Only part');
    await userEvent.click(confirm);
    expect(editBook.mock.calls[0][2]).toMatchObject({
      action: 'setToleranceExemption',
      minerId: 'solo:2',
      date: '2026-08-11',
      forgive: 400,
      reason: 'Only part',
    });
  });
});
