import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { BookProvider } from './BookContext';
import { BookHealthStrip } from './BookHealthStrip';
import type { BookContextValue } from './bookContextValue';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(), readAudit: vi.fn() }));

const sync = {
  status: { kind: 'fresh', ageMs: 3_600_000, byName: 'Pilot 9', scheduled: true, gaps: [] },
  run: { phase: 'idle' },
  sync: vi.fn(),
} as unknown as CorpTaxBookSync;

function renderStrip(
  scheduledSync: ScheduledSyncStatus | null,
  strip: CorpTaxBookSync = sync,
  feeders: unknown[] = []
) {
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: 7,
            corporationId: 98000001,
            view: { unrated: [], billableThrough: null, input: { graceHours: 6 } },
            names: { refinery: () => 'Efa - Brass Anvil' },
            data: { scheduledSync, feeders },
            verdict: { canEdit: true },
            reload: vi.fn(),
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <BookHealthStrip sync={strip} />
      </BookProvider>
    </MemoryRouter>
  );
}

describe('BookHealthStrip, no readable refineries', () => {
  it('says so instead of reading as synced', () => {
    renderStrip(null, {
      status: { kind: 'fresh', ageMs: 1000, byName: 'Pilot 9', scheduled: false, gaps: [] },
      run: { phase: 'done', outcome: { kind: 'synced', noRefineries: true } },
      sync: vi.fn(),
    } as unknown as CorpTaxBookSync);
    expect(screen.getByText(/no refineries the book can read/)).toBeInTheDocument();
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });

  it('reads as synced for a book that collects for moon owners', () => {
    renderStrip(
      null,
      {
        status: { kind: 'fresh', ageMs: 1000, byName: 'Pilot 9', scheduled: false, gaps: [] },
        run: { phase: 'done', outcome: { kind: 'synced', noRefineries: true } },
        sync: vi.fn(),
      } as unknown as CorpTaxBookSync,
      [{ corporationId: 98000002, status: 'active' }]
    );
    expect(screen.queryByText(/no refineries the book can read/)).not.toBeInTheDocument();
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });
});

describe('BookHealthStrip, scheduled sync', () => {
  it('shows the last scheduled run as the sync line', () => {
    renderStrip(null);
    expect(screen.getByText(/Last synced .* by Scheduled sync \(Pilot 9\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Automatic sync stopped/)).not.toBeInTheDocument();
  });

  it.each([
    ['role-lost', 'Pilot 9 no longer has the Accountant, Director or CEO role'],
    ['left-corp', 'Pilot 9 left the corporation'],
    ['token-revoked', "Pilot 9's EVE authorization was revoked or expired"],
    ['esi-refused', "EVE no longer lets Pilot 9's authorization read the mining ledger"],
    ['book-off', 'the Corp Tax Book was turned off'],
    ['grant-unreadable', "the saved grant can't be read — turn it on again"],
  ] as const)('says why a stopped schedule stopped (%s)', (stoppedReason, why) => {
    renderStrip({
      status: 'stopped',
      characterId: 9,
      characterName: 'Pilot 9',
      enabledAt: 1,
      stoppedAt: 2,
      stoppedReason,
    });
    expect(screen.getByText(`Automatic sync stopped: ${why}`)).toBeInTheDocument();
  });

  it('says nothing extra while the schedule is running', () => {
    renderStrip({ status: 'active', characterId: 9, characterName: 'Pilot 9', enabledAt: 1 });
    expect(screen.queryByText(/Automatic sync stopped/)).not.toBeInTheDocument();
  });
});
