import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import type { OreDispute } from '@/engine/corpTaxBook/disputes';
import type { ClaimedTransfer, Declaration } from '@/engine/corpTaxBook/overdue';
import { DEFAULT_NOTICE_RULES } from '@/engine/corpTaxBook/notices';
import { BookProvider } from './BookContext';
import { NeedsYouQueue } from './NeedsYouQueue';
import type { BookContextValue } from './bookContextValue';

vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(async () => ({})), readAudit: vi.fn() }));
const loadDivisions = vi.fn(async () => ({ cached: null, needsReauth: false }) as unknown);
vi.mock('../wallet', () => ({ loadCorporationDivisions: () => loadDivisions() }));
vi.mock('./lateNoticeMailing', () => ({
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
const ownCharacters = vi.hoisted(() => ({ ids: [] as number[] }));
vi.mock('@/features/character/useCharacters', () => ({
  useCharacters: () => ownCharacters.ids.map((characterId) => ({ characterId })),
}));
const wallet = vi.hoisted(() => ({
  hasWalletScope: vi.fn(async () => true),
  loadWalletJournalHistory: vi.fn(async () => ({
    cached: { data: [] as unknown[] },
    needsReauth: false,
  })),
}));
vi.mock('@/features/character/wallet', () => wallet);
const { editBook } = await import('../taxBook/bookClient');

const miner = (id: string, characterId: number, over: Partial<MinerRow> = {}): MinerRow => ({
  id,
  mainCharacterId: characterId,
  characterIds: [characterId],
  standing: 'member',
  owed: 5_000_000,
  overdueDays: null,
  pending: 0,
  credit: 0,
  lastPaidAt: null,
  paused: false,
  account: { paidThrough: null, owes: null, closableThrough: null },
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
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: 9,
            corporationId: 98000001,
            // The tabs read the view's Miners and Needs you items: the test's own.
            view: {
              ...((view as object | undefined) ?? {
                input: {
                  notices: [
                    {
                      id: 's1',
                      minerId: 'solo:7',
                      issuedAt: '2026-10-01T00:00:00Z',
                      lines: [],
                      mail: { sent: 1, manualSent: 0, remindersStopped: false },
                    },
                  ],
                  miners: [],
                  now: '2026-10-20T00:00:00Z',
                  declarations: [],
                  dismissals: [],
                },
                miners: [],
                internals: { byMiner: new Map() },
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
              }),
              // A built view keeps its own Miners; a hand-built one takes the given ones.
              miners: (view as { miners?: MinerRow[] } | undefined)?.miners?.length
                ? (view as { miners: MinerRow[] }).miners
                : miners,
              needsYou,
            },
            names: {
              character: (id: number) => `Pilot ${id}`,
              refinery: () => 'Refinery',
              ore: () => 'Zeolites',
            },
            data: { uncounted, disputes },
            settings: { divisions, divisionNames: {}, noticeRules: DEFAULT_NOTICE_RULES },
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
      // The server adds division 2 to what it stores; the list is for an older server.
      patch: { addDivision: 2, divisions: [1, 2] },
    });
  });

  it("sends the counted division's name with it, so members see it at once", async () => {
    loadDivisions.mockResolvedValueOnce({
      cached: { data: { wallet: [{ division: 2, name: 'Market Funds' }] } },
      needsReauth: false,
    });
    renderQueue([], { uncounted: [noted] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Count Division 2' }));
    expect(editBook).toHaveBeenLastCalledWith(9, 98000001, {
      action: 'updateSettings',
      patch: { addDivision: 2, divisions: [1, 2], divisionNames: { 2: 'Market Funds' } },
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
    renderQueue([{ kind: 'overdue', minerId: 'solo:7', days: 3, owed: 5_000_000, noticeId: 's1' }]);
    expect(screen.getByRole('button', { name: 'Waive all' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('offers a leaver a reminder as well as a write-off, and does not promise monthly mail', () => {
    renderQueue([{ kind: 'leaver', minerId: 'solo:7', owed: 5_000_000, noticeId: 's1' }], {
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

  it('names the Miners an ambiguous donation could be, for the officer to pick', () => {
    renderQueue(
      [
        {
          kind: 'unmatched',
          payment: {
            id: 'j1_6',
            characterId: 5,
            amount: 1_000_000,
            at: '2026-10-10T00:00:00Z',
            source: 'donation',
            reviewReason: 'ambiguous',
            ambiguousMinerIds: ['solo:7', 'solo:8'],
          },
        },
      ],
      { miners: [miner('solo:7', 7), miner('solo:8', 8)] }
    );
    expect(
      screen.getByText(/could credit it to Pilot 7 or Pilot 8 and cannot tell which/)
    ).toBeInTheDocument();
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
    renderQueue([], {
      disputes: [dispute],
      view: {
        input: {
          miners: [],
          now: '2026-10-20T00:00:00Z',
          notices: [],
          dismissals: [],
          declarations: [],
        },
        miners: [],
        internals: { byMiner: new Map() },
        charges: [],
      },
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Waive their ore' }));
    await user.type(screen.getByRole('textbox'), 'Their ore');
    expect(screen.getByText(/cannot price that day/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Waive/ }).at(-1)).toBeDisabled();
  });

  it('rejects a dispute with a note (#6206)', async () => {
    renderQueue([], { disputes: [dispute] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Keep the bill' }));
    const [reason, nextStep] = screen.getAllByRole('textbox');
    await user.type(reason!, 'Our moon');
    // The next step is required: Confirm stays disabled until it is filled.
    const confirm = screen.getAllByRole('button', { name: 'Keep the bill' }).at(-1)!;
    expect(confirm).toBeDisabled();
    expect(
      screen.getByText(/Required\. Pilot 7 sees this exactly as written, beside the bill/)
    ).toBeInTheDocument();
    await user.type(nextStep!, 'Send the journal line');
    await user.click(confirm);
    expect(editBook).toHaveBeenCalledWith(9, 98000001, {
      action: 'rejectDispute',
      disputeId: 'solo_7_2026-09-05',
      reason: 'Our moon',
      nextStep: 'Send the journal line',
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
          noticeId: 's1',
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
          noticeId: 's1',
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

  describe('dispute cards by kind', () => {
    const line = dispute.lines;
    it('reads a quantity dispute with its lines and reason', () => {
      renderQueue([], {
        disputes: [{ ...dispute, kind: 'quantity', reason: 'I mined half that' }],
      });
      expect(
        screen.getByText(/^Pilot 7 says the book recorded too much ore on /)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Disputed: 1,200 Zeolites\. “I mined half that”/)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Waive it' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Keep the bill' })).toBeInTheDocument();
    });
    it('reads a rate dispute with the claimed and the billed rate', () => {
      renderQueue([], {
        disputes: [{ ...dispute, kind: 'rate', claimedPct: 5, reason: 'Fleet rate', lines: line }],
      });
      expect(screen.getByText(/should be 5%, not 10%$/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Waive the difference' })).toBeInTheDocument();
    });
    it('reads a not-paying dispute with the amount and writes it off', async () => {
      renderQueue([], { disputes: [{ ...dispute, kind: 'notPaying', reason: 'Untaxed op' }] });
      expect(screen.getByText(/^Pilot 7 isn't paying .* · 1,200,000$/)).toBeInTheDocument();
      expect(screen.getByText('“Untaxed op”')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Write off' }));
      expect(screen.getByText(/1,200,000 of tax on the ore they disputed/)).toBeInTheDocument();
    });
    it('says an open dispute holds its day', () => {
      renderQueue([], { disputes: [{ ...dispute, at: new Date().toISOString() }] });
      expect(
        screen.getByText(/^Held until \d+ \w+ — payments skip it while you answer$/)
      ).toBeInTheDocument();
    });
  });

  it('says what a hold did: the held day, which payments skip', () => {
    renderQueue([], {
      disputes: [{ ...dispute, kind: 'notPaying', at: new Date().toISOString() }],
      view: {
        input: {
          miners: [],
          now: '2026-10-20T00:00:00Z',
          notices: [],
          declarations: [],
          dismissals: [],
        },
        miners: [],
        internals: {
          byMiner: new Map([
            ['solo:7', { account: { day: () => ({ held: true, tax: 1_200_000 }) } }],
          ]),
        },
        charges: [],
      },
    });
    expect(
      screen.getByText(
        /^1,200,000 is held until \d+ \w+: payments skip the disputed day and pay the next ones\.$/
      )
    ).toBeInTheDocument();
  });

  describe('declaration wallet check', () => {
    const claim = (over: Partial<Declaration> = {}): NeedsYouItem => ({
      kind: 'declaration',
      minerId: 'solo:7',
      owed: 5_000_000,
      declaration: {
        id: 'x1',
        noticeId: 's1',
        kind: 'another-way',
        at: '2026-11-10T00:00:00Z',
        ...over,
      },
    });
    const tr = (journalRef: number, over: Partial<ClaimedTransfer> = {}): ClaimedTransfer => ({
      amount: 10_000_000,
      at: '2026-11-10T12:00:00.000Z',
      journalRef,
      recipient: 'corporation',
      ...over,
    });
    it.each([
      ['found', 'Found'],
      ['division', 'Found · Division 3'],
      ['notSynced', 'Not synced yet'],
      ['tooOld', 'Too old to check'],
      ['notFound', 'Not in the corp wallet'],
      ['person', 'Paid to a person'],
      ['otherCorp', 'Another corporation'],
    ] as const)('pills a %s check', (result, label) => {
      renderQueue([
        claim({
          transfers: [tr(77)],
          checks: [{ result, ...(result === 'division' ? { division: 3 } : {}) }],
        }),
      ]);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(/10,000,000 · 10 Nov 12:00 · journal ref 77/)).toBeInTheDocument();
    });
    it('explains a transfer too old to check, and offers to count a division', async () => {
      renderQueue([
        claim({
          transfers: [tr(1), tr(2)],
          checks: [{ result: 'tooOld' }, { result: 'division', division: 3 }],
        }),
      ]);
      expect(screen.getByText('before the wallet history the book holds')).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Count Division 3' }));
      expect(editBook).toHaveBeenLastCalledWith(
        9,
        98000001,
        expect.objectContaining({ action: 'updateSettings' })
      );
    });
    it('keeps a bill only with a next step, and sends it', async () => {
      renderQueue([claim({ amount: 4_000_000 })]);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Keep the bill' }));
      const [reason, nextStep] = screen.getAllByRole('textbox');
      await user.type(reason!, 'Not found');
      const confirm = screen.getAllByRole('button', { name: 'Keep the bill' }).at(-1)!;
      expect(confirm).toBeDisabled();
      await user.type(nextStep!, 'Send a screenshot');
      await user.click(confirm);
      expect(editBook).toHaveBeenLastCalledWith(9, 98000001, {
        action: 'resolveDeclaration',
        declarationId: 'x1',
        resolution: 'rejected',
        reason: 'Not found',
        nextStep: 'Send a screenshot',
      });
    });

    describe('paid to you', () => {
      beforeEach(() => {
        wallet.loadWalletJournalHistory.mockClear();
      });
      const toYou = claim({
        transfers: [tr(55, { recipient: 'character', recipientId: 4242 })],
        checks: [{ result: 'person' }],
      });
      const journalEntry = {
        id: 9001,
        date: '2026-11-10T12:20:00Z',
        ref_type: 'player_donation',
        description: '',
        amount: 10_000_000,
        first_party_id: 7,
      };
      it('finds it in your own wallet and records it as tax', async () => {
        ownCharacters.ids = [4242];
        wallet.loadWalletJournalHistory.mockResolvedValueOnce({
          cached: { data: [journalEntry] },
          needsReauth: false,
        });
        renderQueue([toYou]);
        expect(
          await screen.findByText(/^Pilot 7 says they paid you 10,000,000 as tax$/)
        ).toBeInTheDocument();
        expect(await screen.findByText('In your wallet')).toBeInTheDocument();
        expect(
          screen.getByText(/your journal ref 9001\. The book can't see it/)
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: "It wasn't tax" })).toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button', { name: 'Record it as tax' }));
        expect(await screen.findByText('Record payment: 10000000 as m_x1')).toBeInTheDocument();
        expect(wallet.loadWalletJournalHistory).toHaveBeenCalledTimes(1);
        expect(wallet.loadWalletJournalHistory).toHaveBeenCalledWith(4242);
      });
      it('names only what went to you when the rest went to the corporation', async () => {
        ownCharacters.ids = [4242];
        wallet.loadWalletJournalHistory.mockResolvedValueOnce({
          cached: { data: [journalEntry] },
          needsReauth: false,
        });
        renderQueue([
          claim({
            transfers: [
              tr(54, { amount: 3_000_000 }),
              tr(55, { recipient: 'character', recipientId: 4242 }),
            ],
            checks: [{ result: 'notFound' }, { result: 'person' }],
          }),
        ]);
        expect(
          await screen.findByText(/^Pilot 7 says they paid you 10,000,000 as tax$/)
        ).toBeInTheDocument();
      });
      it('says so when it is not in your wallet, back to the oldest entry read', async () => {
        ownCharacters.ids = [4242];
        wallet.loadWalletJournalHistory.mockResolvedValueOnce({
          cached: { data: [{ ...journalEntry, id: 1, amount: 5, date: '2026-10-01T00:00:00Z' }] },
          needsReauth: false,
        });
        renderQueue([toYou]);
        expect(await screen.findByText('Not in your wallet')).toBeInTheDocument();
        expect(screen.getByText('Checked your wallet journal back to 1 Oct.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Record it anyway' })).toBeInTheDocument();
      });
      it('does not read a wallet the Character gave no scope for', async () => {
        ownCharacters.ids = [4242];
        wallet.hasWalletScope.mockResolvedValueOnce(false);
        renderQueue([toYou]);
        expect(await screen.findByText("Can't check your wallet")).toBeInTheDocument();
        expect(wallet.loadWalletJournalHistory).not.toHaveBeenCalled();
      });
    });
  });

  describe('credited automatically', () => {
    it('lists a claim the book confirmed itself in the last week, as a line with a Miner link', () => {
      const at = new Date(Date.now() - 86_400_000).toISOString();
      renderQueue([], {
        view: {
          miners: [],
          internals: { byMiner: new Map() },
          input: {
            miners: [],
            now: '2026-10-20T00:00:00Z',
            notices: [{ id: 's1', minerId: 'solo:7' }],
            dismissals: [],
            declarations: [
              {
                id: 'a1',
                noticeId: 's1',
                kind: 'another-way',
                at,
                transfers: [{ amount: 3_000_000, at, journalRef: 1, recipient: 'corporation' }],
                resolution: { kind: 'confirmed', at, by: 0 },
              },
              {
                id: 'a2',
                noticeId: 's1',
                kind: 'another-way',
                at,
                resolution: { kind: 'confirmed', at: '2026-01-01T00:00:00Z', by: 0 },
              },
            ],
          },
          charges: [],
        },
      });
      expect(
        screen.getByText(
          /Credited automatically:.*, 3,000,000 \(.*\) — found in the corporation's wallet\./
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pilot 7' })).toHaveAttribute(
        'href',
        '/corp/moons/miners/solo%3A7'
      );
      expect(screen.getAllByText(/Credited automatically/)).toHaveLength(1);
    });
  });
});

describe('NeedsYouQueue: late notices are due (#6294)', () => {
  it('shows one notice card, linking to the Late notices tab', async () => {
    const { buildBookView } = await import('@/engine/corpTaxBook/bookView');
    const view = buildBookView({
      corporationId: 98000001,
      now: '2026-10-18T14:00:00Z',
      startDate: '2026-08-01',
      graceHours: 6,
      overdueDays: 14,
      hubId: 'jita',
      oreForm: 'compressed',
      structureExpiryHours: {},
      lastSyncedAt: '2026-10-18T12:00:00Z',
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
      // 100,000 units at 1,000 ISK and 10%: 10M a day, the default notice minimum each.
      entries: ['2026-08-10', '2026-09-10'].map((date) => ({
        characterId: 7,
        recordedCorporationId: 98000001,
        structureId: 1001,
        date,
        oreLines: [{ typeId: 45490, quantity: 100_000 }],
      })),
      miners: [],
      notices: [],
      payments: [],
      dismissals: [],
      declarations: [],
      adjustments: [],
      extractions: [],
      pricesOn: () => ({ prices: new Map([[45490, 1000]]), sources: new Map() }),
    });
    renderQueue([], { view });
    expect(screen.getByRole('heading', { name: 'Needs you · 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Late notice due for 1 Miner' })).toHaveAttribute(
      'href',
      '/corp/moons/late-notices'
    );
    expect(screen.getByText(/owe 20,000,000 between them/)).toBeInTheDocument();
  });
});
