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
      hubId: 'jita',
      oreForm: 'compressed',
      ...over,
    },
    ...rest,
  }) as unknown as CorpBookViewBook;

describe('CorpBookSyncNote', () => {
  it('says Safe to pay with the closed day once a sync after the grace period closed it', () => {
    render(<CorpBookSyncNote book={book()} owedNow={957_001} now={NOW} />);
    expect(
      screen.getByText('Safe to pay — 17 Oct is closed (Brass Meridian Logistics synced 2h ago).')
    ).toBeInTheDocument();
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

  it('shows credit for the next Statement, and never a donation waiting to be credited', () => {
    render(<CorpBookSyncNote book={book({ credit: 1_000_000 })} owedNow={1} now={NOW} />);
    expect(screen.getByText(/1,000,000 ISK credit/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting for .* to credit it/)).toBeNull();
  });

  it('says nothing when there is nothing to say', () => {
    const { container } = render(<CorpBookSyncNote book={book()} owedNow={0} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tells a leaver their lines are still readable', () => {
    render(<CorpBookSyncNote book={book({}, { left: true })} owedNow={0} now={NOW} />);
    expect(screen.getByText(/You left Brass Meridian Logistics/)).toBeInTheDocument();
  });
});
