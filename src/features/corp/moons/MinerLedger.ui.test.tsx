import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, minerDetail, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { BookProvider } from './BookContext';
import { MinerLedger } from './MinerLedger';
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

function renderLedger(view = running(), canEdit = true, from?: string) {
  const calls: string[] = [];
  const actions: LedgerActions = {
    editCorrection: (id) => calls.push(`edit:${id}`),
    reverseCorrection: (id) => calls.push(`reverse:${id}`),
    reverseWriteOff: (id) => calls.push(`reverseWriteOff:${id}`),
    chargeShortfall: (d) => calls.push(`charge:${d.date}`),
    changeForgiven: (d) => calls.push(`forgiven:${d.date}`),
    markNotTax: (id) => calls.push(`notTax:${id}`),
    reassignPayment: (id) => calls.push(`reassign:${id}`),
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
        <MinerLedger minerId="solo:2" detail={detail} phone={false} actions={actions} from={from} />
      </BookProvider>
    </MemoryRouter>
  );
  return calls;
}

const rowOf = (text: RegExp) => screen.getByText(text).closest('tr')!;

beforeEach(() => {
  editBook.mockReset().mockResolvedValue({});
});

describe('the Miner ledger row menus (the one Payee ledger)', () => {
  it('offers edit and reverse on a correction, and reverse opens the dialog it names', async () => {
    const calls = renderLedger(running({ adjustments: [correction] }));
    fireEvent.contextMenu(rowOf(/^Adjustment/));
    expect(await screen.findByRole('menuitem', { name: 'Edit correction' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reverse correction' }));
    await vi.waitFor(() => expect(calls).toEqual(['reverse:c1']));
  });

  it('offers charge and change on a forgiven shortfall, and nothing on a reversed row', async () => {
    const reversed: Adjustment = {
      ...correction,
      reversed: { by: 7, at: '2026-09-02T10:00:00Z', reason: 'Entered twice' },
    };
    const calls = renderLedger(running({ adjustments: [reversed] }));
    fireEvent.contextMenu(rowOf(/^Shortfall forgiven/));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Charge this shortfall' }));
    await vi.waitFor(() => expect(calls).toEqual(['charge:2026-08-11']));
    expect(screen.getByText('reversed')).toBeInTheDocument();
    fireEvent.contextMenu(rowOf(/^Reversal/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('gives a paid day no menu: its one action, Change rate, is in the page menu', () => {
    renderLedger(running());
    fireEvent.contextMenu(rowOf(/^Mined at/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('offers a payment not tax and a move to another Miner, and the move opens its dialog', async () => {
    const calls = renderLedger(running());
    fireEvent.contextMenu(rowOf(/^Payment from Pilot 2/));
    expect(await screen.findByRole('menuitem', { name: 'Mark part not tax' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to another Miner' }));
    await vi.waitFor(() => expect(calls).toEqual(['reassign:p1']));
  });

  it("links a wallet payment's detail to its corp wallet entry", async () => {
    const pay = { minerId: 'solo:2', characterId: 2, source: 'donation' } as const;
    renderLedger(
      running({
        payments: [
          { ...pay, id: 'j3_5550123', amount: 199_000, at: '2026-08-12T10:00:00Z' } as never,
        ],
      })
    );
    await userEvent.click(screen.getByText(/^Payment from Pilot 2/));
    expect(screen.getByRole('link', { name: 'View the payment' })).toHaveAttribute(
      'href',
      '/corp/wallet?division=3&highlight=5550123'
    );
  });

  it('opens a payment to its source, the days it paid and what was marked not tax', async () => {
    renderLedger(
      running({
        payments: [
          {
            id: 'p1',
            minerId: 'solo:2',
            characterId: 2,
            amount: 249_000,
            notTaxAmount: 50_000,
            at: '2026-08-12T10:00:00Z',
            source: 'manual',
          } as never,
        ],
      })
    );
    await userEvent.click(screen.getByText(/^Payment from Pilot 2/));
    expect(screen.getByText('Recorded by hand')).toBeInTheDocument();
    expect(screen.getByText(/marked not tax, so not credited/)).toHaveTextContent('50,000 ISK');
    expect(screen.getByText('Days it paid')).toBeInTheDocument();
  });

  it("names a donation as one in the payment's detail", async () => {
    renderLedger();
    await userEvent.click(screen.getByText(/^Payment from Pilot 2/));
    expect(screen.getByText('A donation')).toBeInTheDocument();
  });

  it("hides rows before the page's range, and keeps the later ones", () => {
    renderLedger(running(), true, '2026-08-13');
    expect(screen.queryByText(/^Payment from Pilot 2/)).not.toBeInTheDocument();
    renderLedger(running(), true, '2026-08-12');
    expect(screen.getByText(/^Payment from Pilot 2/)).toBeInTheDocument();
  });

  it('gives a row dated before the lock date no menu: locked history is read-only', () => {
    renderLedger(running({ adjustments: [correction], now: '2026-11-18T14:00:00Z' }));
    fireEvent.contextMenu(rowOf(/^Adjustment/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.contextMenu(rowOf(/^Payment from Pilot 2/));
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  describe('the lock divider', () => {
    const now = '2026-11-18T14:00:00Z';
    const earlier = {
      id: 'p1',
      minerId: 'solo:2',
      characterId: 2,
      amount: 199_000,
      at: '2026-08-12T10:00:00Z',
      source: 'donation',
    } as never;
    const later = {
      id: 'p2',
      minerId: 'solo:2',
      characterId: 2,
      amount: 10_000,
      at: '2026-10-20T10:00:00Z',
      source: 'donation',
    } as never;
    const divider = () => screen.queryAllByText(/^Locked before/);

    it('sits once between the open rows above and the locked rows below', () => {
      renderLedger(running({ adjustments: [correction], payments: [earlier, later], now }));
      expect(divider()).toHaveLength(1);
      expect(divider()[0]).toHaveTextContent(
        'Locked before 1 Sep · fix with a correction dated 1 Sep or later'
      );
      const tr = divider()[0]!.closest('tr')!;
      expect(tr.previousElementSibling).toHaveTextContent('2026-10-20');
      expect(tr.nextElementSibling).toHaveTextContent('2026-08');
    });

    it('sits at the top when every row is older', () => {
      renderLedger(running({ adjustments: [correction], now }));
      expect(divider()).toHaveLength(1);
      expect(divider()[0]!.closest('tr')!.previousElementSibling).toBeNull();
    });

    it('is absent when every row is on or after the lock date', () => {
      renderLedger(running({ adjustments: [correction] }));
      expect(divider()).toHaveLength(0);
    });
  });

  it('has no menu without edit rights', () => {
    renderLedger(running({ adjustments: [correction] }), false);
    fireEvent.contextMenu(rowOf(/^Adjustment/));
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
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
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
