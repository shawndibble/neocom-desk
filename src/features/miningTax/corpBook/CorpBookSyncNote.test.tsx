import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { CorpBookSyncNote } from './CorpBookSyncNote';
import type { CorpBookViewBook } from './corpBookView';

const NOW = Date.parse('2026-10-18T14:00:00Z');

const book = (over: Partial<CorpBookViewBook['summary']> = {}, rest = {}): CorpBookViewBook =>
  ({
    corpName: 'Brass Meridian Logistics',
    left: false,
    loaded: { graceHours: 6 },
    summary: {
      corporationId: 98000001,
      corpName: 'Brass Meridian Logistics',
      startDate: '2026-10-01',
      lastSyncedAt: '2026-10-18T12:00:00Z',
      closedThrough: '2026-10-17',
      credit: 0,
      estimate: 0,
      hubId: 'jita',
      oreForm: 'compressed',
      ...over,
    },
    ...rest,
  }) as unknown as CorpBookViewBook;

describe('CorpBookSyncNote opening balance', () => {
  const opening = (amount: number, reversed = false) =>
    ({
      id: 'o1',
      minerId: 'solo:1',
      date: '2026-10-01',
      amount,
      reason: 'x',
      by: 1,
      at: '2026-10-02T00:00:00Z',
      kind: 'opening',
      ...(reversed ? { reversed: { by: 1, at: '2026-10-03T00:00:00Z', reason: 'x' } } : {}),
    }) as never;
  const withOpening = (amount: number, reversed = false) =>
    book({}, { loaded: { graceHours: 6, adjustments: [opening(amount, reversed)] } });

  it('says the balance rolled over from the old system, owing or credit', () => {
    const { rerender } = render(
      <CorpBookSyncNote book={withOpening(4_200_000)} owedNow={4_200_000} now={NOW} />
    );
    expect(
      screen.getByText(
        'Opening balance from the old system: you owe Brass Meridian Logistics 4,200,000 ISK.'
      )
    ).toBeInTheDocument();
    rerender(
      <CorpBookSyncNote
        book={{
          ...withOpening(-900_000),
          summary: { ...withOpening(-900_000).summary, credit: 900_000 },
        }}
        owedNow={0}
        now={NOW}
      />
    );
    expect(
      screen.getByText(
        'Opening balance from the old system: Brass Meridian Logistics holds 900,000 ISK credit for you.'
      )
    ).toBeInTheDocument();
  });

  it('says nothing once the balance rolled over has been paid', () => {
    render(<CorpBookSyncNote book={withOpening(4_200_000)} owedNow={0} now={NOW} />);
    expect(screen.queryByText(/Opening balance from the old system/)).not.toBeInTheDocument();
  });

  it('leaves out one an officer reversed', () => {
    render(<CorpBookSyncNote book={withOpening(4_200_000, true)} owedNow={0} now={NOW} />);
    expect(screen.queryByText(/Opening balance from the old system/)).not.toBeInTheDocument();
  });
});

describe('CorpBookSyncNote', () => {
  it('says Safe to pay with the closed day once a sync after the grace period closed it', () => {
    render(<CorpBookSyncNote book={book()} owedNow={957_001} now={NOW} />);
    expect(
      screen.getByText('Safe to pay — 17 Oct is closed (Brass Meridian Logistics synced 2h ago).')
    ).toBeInTheDocument();
  });

  it('leaves the corporation out in a dialog that already names it', () => {
    render(<CorpBookSyncNote book={book()} owedNow={957_001} now={NOW} inDialog />);
    expect(screen.getByText('Safe to pay — 17 Oct is closed (synced 2h ago).')).toBeInTheDocument();
    expect(screen.queryByText(/Brass Meridian/)).not.toBeInTheDocument();
  });

  it('says Safe to pay once the corp syncs, with how long ago, until then', () => {
    render(
      <CorpBookSyncNote
        book={book({ closedThrough: undefined, lastSyncedAt: '2026-10-16T14:00:00Z' })}
        owedNow={1}
        now={NOW}
      />
    );
    expect(
      screen.getByText('Safe to pay once Brass Meridian Logistics syncs (last synced 2d ago).')
    ).toBeInTheDocument();
  });

  it('does not call a closed day safe while ore on it is still settling', () => {
    render(
      <CorpBookSyncNote book={book({}, { settlingFrom: '2026-10-17' })} owedNow={1} now={NOW} />
    );
    expect(screen.queryByText(/Safe to pay/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "17 Oct is still settling: Brass Meridian Logistics's refinery log hasn't caught up with all your mining that day (synced 2h ago). Paying now pays only what is billed so far."
      )
    ).toBeInTheDocument();
  });

  it("says what it owes includes the open day's estimate, and when that day is billed", () => {
    render(
      <CorpBookSyncNote
        book={book(
          {
            estimate: 666_000,
            account: {
              paidThrough: null,
              owes: { amount: 100_000, days: 1, oldest: '2026-10-17' },
            },
          },
          { estimateFrom: '2026-10-18' }
        )}
        owedNow={766_000}
        now={NOW}
        showStanding
      />
    );
    expect(
      screen.getByText(
        'You owe 766,000 ISK. 666,000 ISK of it is 18 Oct, billed after 06:00 UTC on 19 Oct.'
      )
    ).toBeInTheDocument();
    // Not "safe to pay" beside a day that is not closed yet.
    expect(screen.queryByText(/Safe to pay/)).not.toBeInTheDocument();
  });

  it("in the pay dialog says the amount includes the open day's estimate", () => {
    render(
      <CorpBookSyncNote
        book={book({ estimate: 666_000 }, { estimateFrom: '2026-10-18' })}
        owedNow={666_000}
        now={NOW}
        showStanding={false}
        inDialog
      />
    );
    expect(
      screen.getByText('666,000 ISK of it is 18 Oct, billed after 06:00 UTC on 19 Oct.')
    ).toBeInTheDocument();
  });

  it('names the day still open and when it closes', () => {
    render(
      <CorpBookSyncNote book={book({}, { pendingFrom: '2026-10-18' })} owedNow={1} now={NOW} />
    );
    expect(
      screen.getByText(
        "18 Oct: safe to pay once it is closed, after 06:00 UTC on 19 Oct and Brass Meridian Logistics's next sync."
      )
    ).toBeInTheDocument();
  });

  it('on a running account says how far behind, and prints nothing for paid through or ahead', () => {
    const behind = {
      paidThrough: '2026-10-14',
      owes: { amount: 5_000_000, days: 2, oldest: '2026-10-15' },
    };
    const { unmount } = render(
      <CorpBookSyncNote book={book({ account: behind })} owedNow={5} now={NOW} />
    );
    expect(
      screen.getByText('You owe Brass Meridian Logistics 5,000,000 ISK: 2 days, oldest 15 Oct.')
    ).toBeInTheDocument();
    unmount();
    const { container } = render(
      <CorpBookSyncNote
        book={book({ credit: 56_000, account: { paidThrough: '2026-10-17', owes: null } })}
        owedNow={0}
        now={NOW}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows credit on the account, and never a donation waiting to be credited', () => {
    render(<CorpBookSyncNote book={book({ credit: 1_000_000 })} owedNow={1} now={NOW} />);
    expect(screen.getByText(/1,000,000 ISK credit/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for .* to credit it/)).toBeNull();
  });

  it('shows credit even with nothing owed now (#6204)', () => {
    render(<CorpBookSyncNote book={book({ credit: 1_000_000 })} owedNow={0} now={NOW} />);
    expect(screen.getByText(/1,000,000 ISK credit/)).toBeInTheDocument();
  });

  it('says nothing when there is nothing to say', () => {
    const { container } = render(<CorpBookSyncNote book={book()} owedNow={0} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  // `LeftCorpNotice` says it, with Pay and Stop showing: saying it here too only repeated it.
  it('leaves a leaver to the left-the-corp notice', () => {
    const { container } = render(
      <CorpBookSyncNote book={book({}, { left: true })} owedNow={0} now={NOW} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
