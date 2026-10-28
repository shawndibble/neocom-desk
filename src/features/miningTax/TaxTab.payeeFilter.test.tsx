import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import type { MoonMiningTaxRow } from './snapshot';

const ME = 90000001;
const ZEO = 45490;
const SYSTEM = 30003838;

const payee = (id: string, name: string) => ({
  id,
  characterId: ME,
  name,
  defaultTaxPct: 10,
  updatedAt: 1,
});
const ASHFALL = payee('p1', 'Ashfall Prospecting');
const BRIMSTONE = payee('p2', 'Brimstone Holdings');

const oreLines = [{ typeId: ZEO, quantity: 1000 }];
const assigned = (date: string, payeeId: string): MoonMiningTaxRow => ({
  characterId: ME,
  characterName: 'Kestrel Vane',
  entry: { characterId: ME, date, solarSystemId: SYSTEM, oreLines },
  assignments: [
    {
      id: `a-${date}`,
      characterId: ME,
      date,
      solarSystemId: SYSTEM,
      payeeId,
      oreLines,
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'outstanding',
      updatedAt: 1,
    },
  ],
  unassignedOreLines: [],
});

const snapshot = {
  entries: [assigned('2026-10-17', 'p1'), assigned('2026-10-13', 'p2')],
  characters: [{ characterId: ME, characterName: 'Kestrel Vane' }],
  payeesByCharacter: new Map([[ME, [ASHFALL, BRIMSTONE]]]),
  unclassified: [],
  reauthCharacters: [],
  fetchedAt: new Date(),
  fromCache: false,
  systemNames: new Map([[SYSTEM, 'Efa']]),
  systemSecurity: new Map([[SYSTEM, -0.1]]),
  typeNames: new Map([[ZEO, 'Zeolites']]),
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
    activeCharacterId: 90000001,
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

function Search() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderTab(search = '') {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/mining/tax?tax.character=all${search}`]}>
      <TaxTab tabBar={null} tabsId="t" />
      <Search />
    </MemoryRouter>
  );
  return user;
}

const openHeading = (count: number) => screen.findByText(`Open · ${count}`);
const payeeParam = () =>
  new URLSearchParams(screen.getByTestId('search').textContent ?? '').get('tax.payee');

async function openMenu(user: ReturnType<typeof userEvent.setup>, trigger: string) {
  await user.click(await screen.findByRole('button', { name: trigger }));
}

describe('TaxTab: Payee filter Select all / Select none', () => {
  it('Select none empties the Open list, reads "No payees" and holds in the URL', async () => {
    const user = renderTab();
    await openMenu(user, 'All payees');
    await user.click(screen.getByRole('menuitem', { name: 'Select none' }));
    expect(
      await screen.findByRole('button', { name: 'No payees', hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByText('No payees selected.')).toBeInTheDocument();
    expect(payeeParam()).toBe('none');
    expect(screen.queryByText(/^Open · /)).not.toBeInTheDocument();
  });

  it('restores "No payees" from a reload of the link', async () => {
    renderTab('&tax.payee=none');
    expect(
      await screen.findByRole('button', { name: 'No payees', hidden: true })
    ).toBeInTheDocument();
    expect(screen.getByText('No payees selected.')).toBeInTheDocument();
  });

  it('Select all after Select none returns to "All payees" and drops the param', async () => {
    const user = renderTab('&tax.payee=none');
    await openMenu(user, 'No payees');
    await user.click(screen.getByRole('menuitem', { name: 'Select all' }));
    expect(
      await screen.findByRole('button', { name: 'All payees', hidden: true })
    ).toBeInTheDocument();
    expect(payeeParam()).toBeNull();
    expect(await openHeading(2)).toBeInTheDocument();
  });

  it('ticking one Payee after Select none shows only its rows', async () => {
    const user = renderTab('&tax.payee=none');
    await openMenu(user, 'No payees');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Ashfall Prospecting' }));
    expect(
      await screen.findByRole('button', { name: '1 payee', hidden: true })
    ).toBeInTheDocument();
    expect(await openHeading(1)).toBeInTheDocument();
    expect(payeeParam()).toBe('p1');
  });

  it('unticking the last Payee by hand lands on "No payees"', async () => {
    const user = renderTab('&tax.payee=p1');
    await openMenu(user, '1 payee');
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Ashfall Prospecting' }));
    expect(
      await screen.findByRole('button', { name: 'No payees', hidden: true })
    ).toBeInTheDocument();
    expect(payeeParam()).toBe('none');
  });

  it('a link naming only unknown Payees still reads as "All payees"', async () => {
    renderTab('&tax.payee=ghost');
    expect(
      await screen.findByRole('button', { name: 'All payees', hidden: true })
    ).toBeInTheDocument();
    expect(await openHeading(2)).toBeInTheDocument();
  });
});
