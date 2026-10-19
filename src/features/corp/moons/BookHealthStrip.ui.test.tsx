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

function renderStrip(scheduledSync: ScheduledSyncStatus | null) {
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: 7,
            corporationId: 98000001,
            view: { unrated: [], billableThrough: null, input: { graceHours: 6 } },
            names: { refinery: () => 'Efa - Brass Anvil' },
            data: { scheduledSync },
            verdict: { canEdit: true },
            reload: vi.fn(),
          } as unknown as Omit<BookContextValue, 'edit' | 'canEdit'>
        }
      >
        <BookHealthStrip sync={sync} />
      </BookProvider>
    </MemoryRouter>
  );
}

describe('BookHealthStrip, scheduled sync', () => {
  it('shows the last scheduled run as the sync line', () => {
    renderStrip(null);
    expect(screen.getByText(/Last synced .* by Scheduled sync \(Pilot 9\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Scheduled sync stopped/)).not.toBeInTheDocument();
  });

  it.each([
    ['role-lost', 'Pilot 9 no longer has the Accountant, Director or CEO role'],
    ['left-corp', 'Pilot 9 left the corporation'],
    ['token-revoked', "Pilot 9's EVE authorization was revoked or expired"],
    ['esi-refused', "EVE no longer lets Pilot 9's authorization read the mining ledger"],
    ['book-off', 'the Corp Tax Book was turned off'],
  ] as const)('says why a stopped schedule stopped (%s)', (stoppedReason, why) => {
    renderStrip({
      status: 'stopped',
      characterId: 9,
      characterName: 'Pilot 9',
      enabledAt: 1,
      stoppedAt: 2,
      stoppedReason,
    });
    expect(screen.getByText(`Scheduled sync stopped: ${why}`)).toBeInTheDocument();
  });

  it('says nothing extra while the schedule is running', () => {
    renderStrip({ status: 'active', characterId: 9, characterName: 'Pilot 9', enabledAt: 1 });
    expect(screen.queryByText(/Scheduled sync stopped/)).not.toBeInTheDocument();
  });
});
