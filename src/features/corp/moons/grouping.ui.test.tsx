import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView } from '@/engine/corpTaxBook/bookView';
import type { Miner } from '@/engine/corpTaxBook/charges';
import { BookProvider } from './BookContext';
import { MinerCharacters } from './MinerCharacters';
import type { BookData, BookSettings, GroupingAnswer, OfficerVerdict } from '../taxBook/bookClient';

const editBook = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (...a: unknown[]) => editBook(...a),
}));

const CORP = 98000001;
const verdict: OfficerVerdict = {
  corporationId: CORP,
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};
const entry = (characterId: number, corp = CORP) => ({
  characterId,
  recordedCorporationId: corp,
  structureId: 1001,
  date: '2026-08-10',
  oreLines: [{ typeId: 45490, quantity: 1000 }],
});

function renderPanel(
  miners: (Miner & { pendingConfirmation?: number[] })[],
  minerId: string,
  ui: (row: ReturnType<typeof buildBookView>['miners'][number]) => ReactElement,
  groupingAnswers: GroupingAnswer[] = []
) {
  const view = buildBookView({
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry(1), entry(2), entry(3, 555)],
    miners,
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({ prices: new Map([[45490, 1000]]), sources: new Map() }),
  });
  const row = view.miners.find((m) => m.id === minerId)!;
  render(
    <MemoryRouter>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: CORP,
          view,
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => `Corp ${id}`,
            refinery: () => 'Refinery',
            moon: (id) => `Moon ${id}`,
            ore: () => 'Sylvite',
          },
          settings: {} as BookSettings,
          data: { state: { miners }, adjustments: [], groupingAnswers } as unknown as BookData,
          verdict,
          reload: vi.fn(),
        }}
      >
        {ui(row)}
      </BookProvider>
    </MemoryRouter>
  );
}

beforeEach(() => editBook.mockReset().mockResolvedValue({}));

describe('MinerCharacters', () => {
  it('marks the main and a character waiting for its confirmation', () => {
    renderPanel(
      [{ id: 'g1', characterIds: [1, 3], mainCharacterId: 1, pendingConfirmation: [3] }],
      'g1',
      (row) => <MinerCharacters miner={row} />
    );
    expect(screen.getByText(/waiting for their confirmation/)).toBeInTheDocument();
    expect(screen.getByText(/· main/)).toBeInTheDocument();
  });

  it('shows the officers a confirmation and a decline after the fact (#4210)', () => {
    const answer = (
      characterId: number,
      a: 'confirmed' | 'declined',
      via: 'character' | 'verify-link'
    ) => ({ characterId, minerId: 'g1', answer: a, at: '2026-10-18T10:00:00Z', via }) as const;
    renderPanel(
      [{ id: 'g1', characterIds: [1, 3], mainCharacterId: 1, pendingConfirmation: [] }],
      'g1',
      (row) => <MinerCharacters miner={row} />,
      [answer(3, 'confirmed', 'character'), answer(4, 'declined', 'verify-link')]
    );
    expect(screen.getByText(/confirmed by the player/)).toBeInTheDocument();
    expect(screen.getByText('Pilot 4')).toBeInTheDocument();
    expect(screen.getByText(/declined, from the main's Statement link/)).toBeInTheDocument();
  });

  it('unlinks a character and makes another the main', async () => {
    renderPanel([{ id: 'g1', characterIds: [1, 2], mainCharacterId: 1 }], 'g1', (row) => (
      <MinerCharacters miner={row} />
    ));
    await userEvent.click(screen.getByRole('button', { name: 'Make main' }));
    expect(editBook).toHaveBeenLastCalledWith(7, CORP, {
      action: 'setMiner',
      minerId: 'g1',
      characterIds: [1, 2],
      mainCharacterId: 2,
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlink' })[1]);
    await waitFor(() =>
      expect(editBook).toHaveBeenLastCalledWith(7, CORP, {
        action: 'unlink',
        minerId: 'g1',
        characterId: 2,
      })
    );
  });

  it('groups another Miner into this one with the engine’s plan', async () => {
    renderPanel([], 'solo:1', (row) => <MinerCharacters miner={row} />);
    await userEvent.click(screen.getByRole('button', { name: 'Group with…' }));
    await userEvent.click(await screen.findByText('Pilot 2'));
    await userEvent.click(screen.getByRole('button', { name: 'Group 1 Miner' }));
    await waitFor(() =>
      expect(editBook).toHaveBeenCalledWith(7, CORP, {
        action: 'regroupMiner',
        minerId: 'solo:1',
        characterIds: [1, 2],
        mainCharacterId: 1,
        absorbMinerIds: [],
      })
    );
    expect(editBook).toHaveBeenCalledTimes(1);
  });
});
