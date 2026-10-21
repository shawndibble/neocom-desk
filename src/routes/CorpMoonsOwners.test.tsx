import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import type { BookData, BookSettings } from '@/features/corp/taxBook/bookClient';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpTaxBook } from '@/features/corp/taxBook/useCorpTaxBook';
import { CorpMoons } from './CorpMoons';

vi.mock('@/features/corp/useCorpAccess', () => ({ useCorpAccess: vi.fn() }));
vi.mock('@/features/corp/taxBook/useCorpTaxBook', () => ({ useCorpTaxBook: vi.fn() }));
const book = vi.hoisted(() => ({ entries: [] as ObservedMiningEntry[] }));
vi.mock('@/features/corp/moons/useCorpBook', async () => {
  const { buildBookView } = await import('@/engine/corpTaxBook/bookView');
  const BOOK = 98000000;
  return {
    useCorpBook: () => {
      const input: BookViewInput = {
        corporationId: BOOK,
        now: '2026-10-20T12:00:00Z',
        startDate: '2026-10-01',
        graceHours: 6,
        minimumStatement: 0,
        overdueDays: 14,
        cadence: { kind: 'monthly' },
        hubId: 'jita',
        oreForm: 'compressed',
        structureExpiryHours: {},
        lastSyncedAt: '2026-10-20T06:00:00Z',
        rates: [],
        entries: book.entries,
        miners: [],
        statements: [],
        payments: [],
        dismissals: [],
        declarations: [],
        adjustments: [],
        extractions: [],
        paidStatementIds: new Set(),
        pricesOn: () => ({ prices: new Map(), sources: new Map() }),
      };
      return {
        state: {
          status: 'ready',
          verdict: { canEdit: true },
          settings: { graceHours: 6, rates: [] } as unknown as BookSettings,
          view: buildBookView(input),
          names: {
            character: (id: number) => `Pilot ${id}`,
            corporation: (id: number) => `Corp ${id}`,
            refinery: (id: number) => `Refinery ${id}`,
            moon: (id: number) => `Moon ${id}`,
            ore: () => 'Ore',
          },
          data: { feeders: [], state: { extractions: [] } } as unknown as BookData,
        },
        reload: vi.fn(),
        characterId: 7,
        corporationId: BOOK,
      };
    },
  };
});

const entry = (source: number | undefined): ObservedMiningEntry => ({
  characterId: 1,
  recordedCorporationId: 5,
  structureId: 10,
  date: '2026-10-05',
  ...(source === undefined ? {} : { sourceCorporationId: source }),
  oreLines: [{ typeId: 1, quantity: 1 }],
});

function mount(path: string) {
  vi.mocked(useCorpAccess).mockReturnValue({
    state: 'ready',
    capabilities: NO_CORP_CAPABILITIES,
    missingScopes: [],
    roles: ['Director'],
    readFailed: false,
    retry: () => {},
  });
  vi.mocked(useCorpTaxBook).mockReturnValue({
    status: { kind: 'never' },
    run: { phase: 'idle' },
    ledger: { state: 'ready', request: vi.fn() },
    sync: vi.fn(),
  } as never);
  render(
    <MemoryRouter initialEntries={[path]}>
      <CorpMoons />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('CorpMoons moon owners', () => {
  it('has no Extractions tab when the book reads no refinery of its own, and lands on Moon owners', () => {
    book.entries = [entry(98000001)];
    mount('/corp/moons/extractions');
    expect(screen.queryByRole('tab', { name: 'Extractions' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Moon owners', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite a moon owner…' })).toBeInTheDocument();
  });

  it('keeps Extractions, and the invite button, for a book with refineries of its own', () => {
    book.entries = [entry(undefined)];
    mount('/corp/moons/moon-owners');
    expect(screen.getByRole('tab', { name: 'Extractions' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Moon owners', selected: true })).toBeInTheDocument();
  });

  it('keeps the invite button off the other tabs', () => {
    book.entries = [entry(undefined)];
    mount('/corp/moons/miners');
    expect(screen.queryByRole('button', { name: 'Invite a moon owner…' })).toBeNull();
  });
});
