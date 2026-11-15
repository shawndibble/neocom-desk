import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MinerRow, NeedsYouItem } from '@/engine/corpTaxBook/bookView';
import type { TabsProjection } from '@/engine/corpTaxBook/readModels';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import { BookProvider } from './BookContext';
import { NeedsYouQueue } from './NeedsYouQueue';
import type { BookContextValue } from './bookContextValue';

vi.mock('../taxBook/bookClient', () => ({ editBook: vi.fn(async () => ({})), readAudit: vi.fn() }));
vi.mock('./statementMailing', () => ({
  mailTarget: vi.fn(),
  useCorporationName: () => 'Brass Anvil Corp',
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
  { miners = [miner('solo:7', 7)], uncounted = [] as UncountedDonation[], divisions = [1] } = {}
) {
  projection.value = { miners, needsYou } as unknown as TabsProjection;
  render(
    <MemoryRouter>
      <BookProvider
        value={
          {
            characterId: 9,
            corporationId: 98000001,
            view: {
              input: {
                statements: [{ id: 's1', periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
              },
            },
            names: { character: (id: number) => `Pilot ${id}`, refinery: () => 'Refinery' },
            data: { uncounted },
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
    expect(screen.getByRole('button', { name: 'Waive all…' })).toBeInTheDocument();
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
});
