import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { TabsProjection } from '@/engine/corpTaxBook/readModels';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import type { OreDispute } from '@/engine/corpTaxBook/disputes';
import { BookProvider } from './BookContext';
import { NeedsYouQueue } from './NeedsYouQueue';
import type { BookContextValue } from './bookContextValue';

vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(async () => ({})), readAudit: vi.fn() }));
vi.mock('./statementMailing', () => ({
  mailTarget: vi.fn(),
  useCorporationName: () => 'Brass Anvil Corp',
}));
// The record dialog previews against a whole book; here only the amount it opens with matters.
vi.mock('./BookDialogs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./BookDialogs')>()),
  RecordPaymentDialog: ({
    defaultAmount,
    paymentId,
  }: {
    defaultAmount: number;
    paymentId?: string;
  }) => (
    <p>
      Record payment: {defaultAmount} as {paymentId}
    </p>
  ),
}));
const projection = vi.hoisted(() => ({ value: { miners: [], needsYou: [] } as unknown }));
vi.mock('./useTabsProjection', () => ({ useTabsProjection: () => projection.value }));
const { editBook } = await import('../taxBook/bookClient');

const miner = (id: string, characterId: number, over: Partial<MinerRow> = {}): MinerRow => ({
  id,
  mainCharacterId: characterId,
  characterIds: [characterId],
  standing: 'member',
  owed: 5_000_000,
  overdueDays: null,
  unbilled: 0,
  pending: 0,
  credit: 0,
  lastPaidAt: null,
  paused: false,
  ...over,
});

const noted: UncountedDonation = {
  id: 'j2_4',
  refId: 4,
  division: 2,
  characterId: 7,
  amount: 5_000_000,
  at: '2026-10-10T00:00:00.000Z',
};

function renderQueue(
  needsYou: NeedsYouItem[],
  {
    miners = [miner('solo:7', 7)],
    uncounted = [] as UncountedDonation[],
    divisions = [1],
    view = undefined as unknown,
    disputes = [] as OreDispute[],
  } = {}
) {
  projection.value = { miners, needsYou } as unknown as TabsProjection;
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: 9,
            corporationId: 98000001,
            view: view ?? {
              input: {
                statements: [{ id: 's1', periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
                dismissals: [],
              },
              charges: [
                {
                  key: '7:1000:2026-09-05',
                  oreLines: [
                    { typeId: 45490, quantity: 1200 },
                    { typeId: 45491, quantity: 500 },
                  ],
                  unitPrices: { 45490: 10_000, 45491: 4_000 },
                  taxPct: 10,
                  taxOwed: 1_400_000,
                },
              ],
            },
            names: {
              character: (id: number) => `Pilot ${id}`,
              refinery: () => 'Refinery',
              ore: () => 'Zeolites',
            },
            data: { uncounted, disputes },
            settings: { divisions, divisionNames: {} },
            verdict: { canEdit: true },
            reload: vi.fn(),
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <NeedsYouQueue />
      </BookProvider>
    </MemoryRouter>
  );
}

describe('NeedsYouQueue (#6207)', () => {
  it('lists a donation into a division the book does not read, and counts that division', async () => {
    renderQueue([], { uncounted: [noted] });
    expect(
      screen.getByText(/^Donation of 5,000,000 from Pilot 7 into Division 2 — not counted/)
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Count Division 2' }));
    expect(editBook).toHaveBeenCalledWith(9, 98000001, {
      action: 'updateSettings',
      patch: { divisions: [1, 2] },
    });
  });

  it('marks one not tax, so the sync never lists it again', async () => {
    renderQueue([], { uncounted: [noted] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Not tax' }));
    expect(editBook).toHaveBeenCalledWith(9, 98000001, {
      action: 'ignoreUncounted',
      uncountedId: 'j2_4',
    });
  });

  it('drops the card once the book reads that division', () => {
    renderQueue([], { uncounted: [noted], divisions: [1, 2] });
    expect(screen.queryByText(/not counted/)).not.toBeInTheDocument();
  });

  it('calls the overdue card’s waiver what it is', () => {
    renderQueue([
      { kind: 'overdue', minerId: 'solo:7', days: 3, owed: 5_000_000, statementId: 's1' },
    ]);
    expect(screen.getByRole('button', { name: 'Waive all' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('offers a leaver a reminder as well as a write-off, and does not promise monthly mail', () => {
    renderQueue([{ kind: 'leaver', minerId: 'solo:7', owed: 5_000_000, statementId: 's1' }], {
      miners: [miner('solo:7', 7, { standing: 'left' })],
    });
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write off' })).toBeInTheDocument();
    expect(screen.queryByText(/mailed each month/)).not.toBeInTheDocument();
  });

  it('says why a known miner’s donation was held for review', () => {
    renderQueue([
      {
        kind: 'unmatched',
        payment: {
          id: 'j1_5',
          characterId: 7,
          amount: 1_000_000,
          at: '2026-10-10T00:00:00Z',
          source: 'donation',
          reviewReason: 'no-open-balance',
        },
      },
    ]);
    expect(screen.getByText(/owed no tax then/)).toBeInTheDocument();
  });

  const dispute: OreDispute = {
    id: 'solo_7_2026-09-05',
    minerId: 'solo:7',
    date: '2026-09-05',
    lines: [
      { recordKey: '7:1000:2026-09-05', typeId: 45490, quantity: 1200, payeeName: 'Rival Corp' },
    ],
    by: 7,
    at: '2026-09-20T00:00:00.000Z',
  };

  it('lists a Miner’s dispute with the day, ore and their Payee, and waives only that ore (#6206)', async () => {
    renderQueue([], { disputes: [dispute] });
    expect(screen.getByText(/^Pilot 7 says .*'s ore went to Rival Corp$/)).toBeInTheDocument();
    expect(screen.getByText(/1,200 Zeolites to Rival Corp/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Waive their ore' }));
    // 1,200 × 10,000 × 10%: the day's other ore stays billed.
    expect(screen.getByText(/1,200,000 of tax on the ore they disputed/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'Their ore');
    await user.click(screen.getByRole('button', { name: 'Waive 1,200,000' }));
    expect(editBook).toHaveBeenCalledWith(9, 98000001, {
      action: 'dismissDispute',
      disputeId: 'solo_7_2026-09-05',
      minerId: 'solo:7',
      amountIsk: 1_200_000,
      reason: 'Their ore',
    });
  });

  it('never waives a dispute whose day it cannot price (#6206)', async () => {
    renderQueue([], { disputes: [dispute], view: { input: { dismissals: [] }, charges: [] } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Waive their ore' }));
    await user.type(screen.getByRole('textbox'), 'Their ore');
    expect(screen.getByText(/cannot price that day/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Waive/ }).at(-1)).toBeDisabled();
  });

  it('rejects a dispute with a note (#6206)', async () => {
    renderQueue([], { disputes: [dispute] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByRole('textbox'), 'Our moon');
    await user.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1)!);
    expect(editBook).toHaveBeenCalledWith(9, 98000001, {
      action: 'rejectDispute',
      disputeId: 'solo_7_2026-09-05',
      reason: 'Our moon',
    });
  });

  it('drops a dispute an officer already answered (#6206)', () => {
    renderQueue([], {
      disputes: [
        {
          ...dispute,
          resolution: { kind: 'rejected', at: '2026-09-21T00:00:00Z', by: 9, reason: 'x' },
        },
      ],
    });
    expect(screen.queryByText(/went to Rival Corp/)).not.toBeInTheDocument();
  });

  it('shows what a Miner declared, amount and note (#6206)', () => {
    renderQueue([
      {
        kind: 'declaration',
        minerId: 'solo:7',
        owed: 5_000_000,
        declaration: {
          id: 'x1',
          statementId: 's1',
          kind: 'another-way',
          at: '2026-09-20T00:00:00Z',
          amount: 4_000_000,
          note: 'by contract',
        },
      },
    ]);
    expect(
      screen.getByText(
        /Paid another way, declared on .*They say they paid 4,000,000\. “by contract”/
      )
    ).toBeInTheDocument();
  });

  it('confirm pre-fills the amount the Miner declared (#6206)', async () => {
    renderQueue([
      {
        kind: 'declaration',
        minerId: 'solo:7',
        owed: 5_000_000,
        declaration: {
          id: 'x1',
          statementId: 's1',
          kind: 'another-way',
          at: '2026-09-20T00:00:00Z',
          amount: 4_000_000,
        },
      },
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm paid' }));
    // The payment id comes from the declaration, so a retry or a second officer cannot double it.
    expect(await screen.findByText('Record payment: 4000000 as m_x1')).toBeInTheDocument();
  });
});

describe('NeedsYouQueue: a Statement run is due (#6208)', () => {
  it('lists the closed periods nobody has billed and links to the Statements tab', async () => {
    const { buildBookView } = await import('@/engine/corpTaxBook/bookView');
    const view = buildBookView({
      corporationId: 98000001,
      now: '2026-10-18T14:00:00Z',
      startDate: '2026-08-01',
      graceHours: 6,
      minimumStatement: 0,
      overdueDays: 14,
      cadence: { kind: 'monthly' },
      hubId: 'jita',
      oreForm: 'compressed',
      structureExpiryHours: {},
      lastSyncedAt: '2026-10-18T12:00:00Z',
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
      entries: ['2026-08-10', '2026-09-10'].map((date) => ({
        characterId: 7,
        recordedCorporationId: 98000001,
        structureId: 1001,
        date,
        oreLines: [{ typeId: 45490, quantity: 1000 }],
      })),
      miners: [],
      statements: [],
      payments: [],
      dismissals: [],
      declarations: [],
      adjustments: [],
      extractions: [],
      paidStatementIds: new Set(),
      pricesOn: () => ({ prices: new Map([[45490, 1000]]), sources: new Map() }),
    });
    renderQueue([], { view });
    expect(screen.getByRole('heading', { name: 'Needs you · 1' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Statements ready for Aug 2026 and Sep 2026' })
    ).toHaveAttribute('href', '/corp/moons/statements');
    expect(screen.getByText(/One run sends them all, oldest first/)).toBeInTheDocument();
  });

  it('has no run card while every closed period is on a Statement', () => {
    renderQueue([]);
    expect(screen.queryByText(/Statements ready/)).not.toBeInTheDocument();
  });
});
