import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { CorpRowDetailModal } from './CorpRowDetailModal';
import type { CorpRowInfo } from './corpRows';

const ZEO = 45490;

const view: BookRowView = {
  id: '98000001:1:1000:2026-10-17',
  corporationId: 98000001,
  corpName: 'Brass Meridian Logistics',
  characterId: 1,
  date: '2026-10-17',
  solarSystemId: 30003838,
  state: 'billed',
  oreLines: [{ typeId: ZEO, quantity: 43_050 }],
  personalOreLines: [{ typeId: ZEO, quantity: 41_200 }],
  unitPrices: { [ZEO]: 148.2 },
  priceSources: { [ZEO]: 'saved' },
  taxPct: 15,
  rateScope: 'moon',
  rateEffectiveFrom: '2026-10-01',
  estimatedValue: 6_380_010,
  taxOwed: 957_001,
  billed: 957_001,
  hubId: 'jita',
  oreForm: 'compressed',
  dispute: {
    quantity: true,
    rate: true,
    personalQuantity: 41_200,
    bookQuantity: 43_050,
    personalPct: 10,
    bookPct: 15,
  },
};

const corp: Extract<CorpRowInfo, { kind: 'row' }> = {
  kind: 'row',
  view,
  corpName: 'Brass Meridian Logistics',
};

const dr = {
  key: view.id,
  status: 'outstanding',
  assignment: null,
  row: { characterName: 'Kestrel Vane' },
  corp,
} as unknown as DisplayRow;

function renderModal(over: Partial<Parameters<typeof CorpRowDetailModal>[0]> = {}) {
  const onPay = vi.fn();
  render(
    <MemoryRouter>
      <CorpRowDetailModal
        open
        onClose={vi.fn()}
        dr={dr}
        corp={corp}
        book={undefined}
        systemName="Efa"
        systemSecurity={-0.1}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onPay={onPay}
        {...over}
      />
    </MemoryRouter>
  );
  return { onPay };
}

describe('CorpRowDetailModal', () => {
  it("opens the Payee's ledger from one link, and shows no paid-by list", async () => {
    const onOpenLedger = vi.fn();
    renderModal({ onOpenLedger });
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open the ledger of Brass Meridian Logistics' })
    );
    expect(onOpenLedger).toHaveBeenCalledOnce();
  });

  it('shows what the book bills, with the book and your own quantity', () => {
    renderModal();
    expect(screen.getByText('957,001 ISK')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText(/43,050 \(corp\) · 41,200 \(you\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/15% per-moon rate from 2026-10-01/).length).toBeGreaterThan(0);
  });

  it('prices each ore line inline and names a source only when it is not the saved snapshot', () => {
    renderModal();
    expect(screen.getByText(/× 148/)).toBeInTheDocument();
    expect(screen.queryByText('Saved snapshot')).not.toBeInTheDocument();
  });

  it('offers Settle up but no way to edit the book’s figures', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /settle up/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unassign/i })).not.toBeInTheDocument();
  });

  it("offers Edit, and Split under its menu, on an open day's estimate", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onSplit = vi.fn();
    const estimate = { ...corp, view: { ...corp.view, state: 'estimate' as const } };
    renderModal({ corp: estimate, onEdit, onSplit });
    expect(screen.getByText(/it is your own entry: edit it, or split off ore/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^edit/i }));
    expect(onEdit).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /more/i }));
    await user.click(await screen.findByRole('menuitem', { name: /split/i }));
    expect(onSplit).toHaveBeenCalledOnce();
  });

  it('opens the book diff as its own dialog from "Compare with the book", not inline', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Disputed: quantity and rate differ')).toBeInTheDocument();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compare with the book' }));
    const diff = await screen.findByRole('dialog', { name: /you and the book/i });
    expect(within(diff).getByText('You')).toBeInTheDocument();
    expect(within(diff).getAllByText('differs').length).toBeGreaterThanOrEqual(2);
    expect(within(diff).getByText('10%')).toBeInTheDocument();
    expect(within(diff).getByText(/Book rate 15% is the per-moon rate/)).toBeInTheDocument();
  });

  it('says Disputed: you 10%, book 15% when only the rate differs', () => {
    const rateOnly: BookRowView = {
      ...view,
      dispute: { ...view.dispute!, quantity: false },
    };
    renderModal({ corp: { ...corp, view: rateOnly } });
    expect(screen.getByText('Disputed: you 10%, book 15%')).toBeInTheDocument();
  });

  it('shows a corp dismissal with its reason and nothing to pay', () => {
    const dismissed: BookRowView = {
      ...view,
      state: 'dismissed',
      taxOwed: 0,
      dismissalReason: 'Fleet op, corp-sanctioned',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: dismissed } });
    expect(screen.getByText(/Fleet op, corp-sanctioned/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settle up/i })).not.toBeInTheDocument();
  });

  it('shows a conflict as not owed yet, with what it bills and when, its notice ahead of the ore', () => {
    const conflict: BookRowView = {
      ...view,
      state: 'conflict',
      taxOwed: null,
      resolvesAt: '2026-11-01T06:00:00.000Z',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: conflict }, notice: <p>Conflict notice</p> });
    expect(screen.getByText('957,001 ISK')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Not owed yet · Brass Meridian Logistics's book bills it on its date unless an officer changes the book"
      )
    ).toBeInTheDocument();
    const notice = screen.getByText('Conflict notice');
    const ore = screen.getByText('Ore');
    expect(notice.compareDocumentPosition(ore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: /settle up/i })).not.toBeInTheDocument();
  });

  it('says why the day is locked and keeps the billed amount once it is paid', () => {
    const paid: BookRowView = {
      ...view,
      state: 'paid',
      taxOwed: 0,
      noticeId: 's1',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: paid } });
    expect(screen.getByText('957,001 ISK')).toBeInTheDocument();
    expect(
      screen.getByText(/keeps these figures, so they can't be edited here\./)
    ).toBeInTheDocument();
    expect(screen.getByText('Late notice')).toBeInTheDocument();
  });

  it('shows a dismissal as 0 ISK and says what the corporation originally billed', () => {
    const dismissed: BookRowView = {
      ...view,
      state: 'dismissed',
      taxOwed: 0,
      dismissalReason: 'No tax on this moon',
      dispute: undefined,
    };
    renderModal({ corp: { ...corp, view: dismissed } });
    expect(screen.getByText('0 ISK')).toBeInTheDocument();
    expect(screen.getByText('Originally billed')).toBeInTheDocument();
    expect(screen.getByText('957,001 ISK')).toBeInTheDocument();
    expect(screen.getByText('Their reason: No tax on this moon')).toBeInTheDocument();
  });

  it('names the donation that paid a day until the corporation never credited it', () => {
    const unlinked: BookRowView = {
      ...view,
      unlinkedDonation: { amount: 26_952_549, at: '2026-11-02T22:38:00Z' },
    };
    renderModal({ corp: { ...corp, view: unlinked } });
    expect(
      screen.getByText(
        /^Your 26,952,549 ISK donation sent 2 Nov( 2026)? 22:38 paid this day, but Brass Meridian Logistics never credited it/
      )
    ).toBeInTheDocument();
  });

  // The Bureau report: the book holds the payment but spent it on an older day it still bills.

  it('says what a Market adjustment forgave', () => {
    renderModal({ corp: { ...corp, view: { ...view, forgivenIsk: 1_000 } } });
    expect(
      screen.getByText(/1,000 ISK forgiven by the corporation\. This is a small shortfall/)
    ).toBeInTheDocument();
  });

  it('keeps a reversed correction in view, struck through and tagged', () => {
    renderModal({
      corp: {
        ...corp,
        view: {
          ...view,
          reversedCorrections: [
            { amount: 300_000, reason: 'Auth rollover', reversedReason: 'Entered twice' },
          ],
        },
      },
    });
    expect(screen.getByText(/300,000 \(Auth rollover\)/)).toBeInTheDocument();
    expect(screen.getByText(/Reversed by an officer: Entered twice/)).toBeInTheDocument();
  });

  it("gives the corporation's reason for a correction (#4622)", () => {
    const corrected = {
      ...corp,
      view: {
        ...view,
        correction: {
          before: 900_000,
          after: 800_000,
          reasons: ['Wrong hub price'],
        },
      },
    };
    renderModal({ corp: corrected });
    expect(
      screen.getByText(
        /Corrected by the corporation: 900,000 → 800,000\. Their reason: Wrong hub price/
      )
    ).toBeInTheDocument();
  });
});

describe('CorpRowDetailModal: Resolve on a Late notice (#6206, resolving in the app)', () => {
  const onNotice = (over: Partial<BookRowView> = {}) => {
    const v = { ...view, dispute: undefined, noticeId: 's1', ...over };
    return { corp: { ...corp, view: v }, dr: { ...dr, corp: { ...corp, view: v } } as DisplayRow };
  };

  it('offers Resolve on a day a Late notice asked for', async () => {
    const onResolve = vi.fn();
    renderModal({ ...onNotice(), onResolve });
    await userEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        problem: expect.objectContaining({ kind: 'overdue', noticeId: 's1' }),
      })
    );
  });

  it('offers nothing with nowhere to send it', () => {
    renderModal({ ...onNotice() });
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  // A plain billed day can still be paid, or said no to: pay / not paying.
  it('offers a plain billed day Resolve even before a Late notice asks for it', async () => {
    const onResolve = vi.fn();
    renderModal({ onResolve, corp: { ...corp, view: { ...view, dispute: undefined } } });
    await userEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ problem: expect.objectContaining({ kind: 'billed' }) })
    );
  });

  it('says it is waiting for the corporation, and does not offer it twice', () => {
    renderModal({
      ...onNotice({
        declaration: { state: 'waiting', at: '2026-10-20T00:00:00Z', amount: 900_000 },
      }),
      onResolve: vi.fn(),
    });
    expect(
      screen.getByText('Declared 900,000 ISK — waiting for Brass Meridian Logistics')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('shows a rejection with its reason and the next step word for word, and Resolve again', () => {
    renderModal({
      ...onNotice({
        declaration: {
          state: 'rejected',
          at: '2026-10-21T00:00:00Z',
          reason: 'No contract',
          nextStep: 'Send the journal ref of the transfer',
        },
      }),
      onResolve: vi.fn(),
    });
    expect(
      screen.getByText('Brass Meridian Logistics rejected your declaration: No contract')
    ).toBeInTheDocument();
    expect(
      screen.getByText('What to do next: Send the journal ref of the transfer')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Resolve' }).length).toBeGreaterThan(0);
  });

  it("shows an officer's kept bill on a billed day, with their next step, and Resolve again", () => {
    renderModal({
      ...onNotice({
        flagged: {
          state: 'rejected',
          kind: 'quantity',
          at: '2026-10-21T00:00:00Z',
          reason: 'The book is right',
          nextStep: 'Pay it, or re-mine the shortfall',
        },
      }),
      onResolve: vi.fn(),
    });
    expect(
      screen.getByText('What to do next: Pay it, or re-mine the shortfall')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Resolve' }).length).toBeGreaterThan(0);
  });
});
