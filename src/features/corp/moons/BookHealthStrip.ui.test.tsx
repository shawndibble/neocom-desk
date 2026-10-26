import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import { BookProvider } from './BookContext';
import { BookHealthStrip } from './BookHealthStrip';
import type { BookContextValue } from './bookContextValue';
import type { CorpTaxBookSync } from '../taxBook/useCorpTaxBook';

vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(), readAudit: vi.fn() }));
const { editBook } = await import('../taxBook/bookClient');

const sync = {
  status: { kind: 'fresh', ageMs: 3_600_000, byName: 'Pilot 9', scheduled: true, gaps: [] },
  run: { phase: 'idle' },
  sync: vi.fn(),
} as unknown as CorpTaxBookSync;

function renderStrip(
  scheduledSync: ScheduledSyncStatus | null,
  strip: CorpTaxBookSync = sync,
  feeders: unknown[] = [],
  settings: { membersSeeFrom?: number } = {}
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
            settings,
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
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
  });
});

describe('BookHealthStrip, scheduled sync', () => {
  it('leaves the age of a fresh sync to the page title and says nothing', () => {
    renderStrip(null);
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Automatic sync stopped/)).not.toBeInTheDocument();
  });

  it('warns, naming who synced, once the book goes stale', () => {
    renderStrip(null, {
      ...sync,
      status: {
        kind: 'stale',
        ageMs: 4 * 86_400_000,
        byName: 'Pilot 9',
        scheduled: true,
        gaps: [],
      },
    } as unknown as CorpTaxBookSync);
    expect(screen.getByText(/Last synced .* by Scheduled sync \(Pilot 9\)/)).toBeInTheDocument();
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

describe('BookHealthStrip, member hold', () => {
  it('tells officers when members start to see a new book', () => {
    renderStrip(null, sync, [], { membersSeeFrom: Date.now() + 3_600_000 });
    expect(screen.getByText(/Hidden from members until/)).toBeInTheDocument();
  });

  it('says nothing once the hold has run out', () => {
    renderStrip(null, sync, [], { membersSeeFrom: Date.now() - 1000 });
    expect(screen.queryByText(/Hidden from members/)).toBeNull();
  });
});

describe('BookHealthStrip, plain status', () => {
  it('is no strip at all, and no Sync now or Billable line, while every check passes', () => {
    renderStrip(null);
    expect(screen.queryByText(/Last synced/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sync now/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Billable through/)).not.toBeInTheDocument();
    expect(screen.queryByText(/need attention|needs attention/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays an amber attention strip when a check fails', () => {
    renderStrip(null, {
      ...sync,
      status: { kind: 'never', gaps: [] },
    } as unknown as CorpTaxBookSync);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('lets a Director end the member hold now', async () => {
    render(
      <MemoryRouter>
        <BookProvider
          value={
            {
              characterId: 7,
              corporationId: 98000001,
              view: { unrated: [], billableThrough: null, input: { graceHours: 6 } },
              names: { refinery: () => 'x' },
              data: { scheduledSync: null, feeders: [] },
              settings: { membersSeeFrom: Date.now() + 3_600_000 },
              verdict: { canEdit: true, isDirector: true },
              reload: vi.fn(),
            } as unknown as BookContextValue
          }
        >
          <BookHealthStrip sync={sync} />
        </BookProvider>
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show to members now' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000001, {
      action: 'updateSettings',
      patch: { showToMembers: true },
    });
    await waitFor(() => expect(screen.queryByText(/Hidden from members/)).toBeNull());
  });
});
