import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';

const ME = 90000001;
const ALT = 90000002;

const snapshot = {
  entries: [],
  characters: [
    { characterId: ME, characterName: 'Kestrel Vane' },
    { characterId: ALT, characterName: 'Shadow Ruler' },
  ],
  payeesByCharacter: new Map(),
  unclassified: [],
  reauthCharacters: [{ characterId: ALT, characterName: 'Shadow Ruler' }],
  fetchedAt: new Date(),
  fromCache: false,
  systemNames: new Map(),
  systemSecurity: new Map(),
  typeNames: new Map(),
  datedPrices: {
    byHubAndDate: new Map(),
    unpricedByHub: new Map(),
    sellFallbackByHubAndDate: new Map(),
    unpriced: new Set<number>(),
  } satisfies DatedUnitPrices,
  unpricedByHub: new Map(),
  unpricedTypeIds: new Set<number>(),
};

vi.mock('@/lib/useRouteSnapshot', () => ({
  useRouteSnapshot: () => ({
    data: snapshot,
    error: null,
    loading: false,
    activeCharacterId: ME,
    refresh: vi.fn(),
  }),
}));
vi.mock('./corpBook/useCorpBookView', () => ({
  useCorpBookView: () => ({ view: null, reload: vi.fn() }),
}));
vi.mock('@/features/miningTax/madePayments', () => ({
  loadMadePaymentsWithStatus: async () => ({ payments: [], sources: [] }),
}));

const { TaxTab } = await import('./TaxTab');

function renderTab(search = '') {
  render(
    <MemoryRouter initialEntries={[`/mining/tax${search}`]}>
      <TaxTab tabBar={null} tabsId="t" />
    </MemoryRouter>
  );
}

describe('TaxTab: a Character whose ledger cannot be read', () => {
  it('names it in the all-Characters view', async () => {
    renderTab('?tax.character=all');
    expect(
      await screen.findByText('Shadow Ruler needs to log in again to see their mining ledger.')
    ).toBeInTheDocument();
  });

  it('says nothing about it while the view shows only other Characters', async () => {
    renderTab('?tax.character=current');
    await screen.findAllByRole('button');
    expect(screen.queryByText(/Shadow Ruler needs to log in again/)).not.toBeInTheDocument();
  });
});
