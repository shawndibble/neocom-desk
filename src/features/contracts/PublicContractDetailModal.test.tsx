import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PublicContractDetailModal } from './PublicContractDetailModal';
import { configureClipboard } from '@/lib/clipboard';
import type { PublicContractItem } from '@/esi/endpoints';

const loadContractLocationName = vi.fn(
  async () => 'Jita IV - Moon 4 - Caldari Navy Assembly Plant'
);
vi.mock('@/features/character/contractLocationName', () => ({
  loadContractLocationName: () => loadContractLocationName(),
}));

const loadPublicContractItems = vi.fn();
vi.mock('@/features/bpcContracts/publicContractItems', () => ({
  loadPublicContractItems: (...args: unknown[]) => loadPublicContractItems(...args),
}));

const mutamarket = vi.hoisted(() => ({ getAbyssalEstimate: vi.fn() }));
vi.mock('@/market/mutamarket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/market/mutamarket')>()),
  getAbyssalEstimate: (...args: unknown[]) => mutamarket.getAbyssalEstimate(...args),
}));

const ABYSSAL_TYPE = 47832;
vi.mock('@/features/abyssal/mutaplasmidData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/abyssal/mutaplasmidData')>()),
  useMutaplasmidLookup: () => ({ isAbyssalType: (typeId: number) => typeId === 47832 }),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async () =>
      new Map([
        [40520, 'Large Skill Injector'],
        [40519, 'Skill Extractor'],
      ])
  ),
}));

/** One ISK figure per type, so the per-side totals are checkable by hand. */
vi.mock('@/market/prices', () => ({
  getHubPricesWithStatus: vi.fn(async () => ({
    unreachable: false,
    prices: new Map([
      [40520, { sellMin: 1_000_000_000, buyMax: 900_000_000 }],
      [40519, { sellMin: 100_000_000, buyMax: 90_000_000 }],
    ]),
  })),
}));

function item(overrides: Partial<PublicContractItem> & { record_id: number }): PublicContractItem {
  return { type_id: 40520, quantity: 1, is_included: true, ...overrides };
}

function showItems(items: PublicContractItem[]) {
  loadPublicContractItems.mockResolvedValue({ data: { kind: 'items', items } });
}

function renderModal(
  system?: { id: number; name: string } | null,
  extra: Partial<React.ComponentProps<typeof PublicContractDetailModal>> = {}
) {
  render(
    <MemoryRouter>
      <PublicContractDetailModal
        system={system}
        {...extra}
        title="Large Skill Injector"
        characterId={1}
        contractId={235091192}
        locationId={60003760}
        regionName="The Forge"
        dateExpired={Date.UTC(2026, 8, 13, 14, 59)}
        statChips={[{ label: 'Price', value: '0.00' }]}
        onClose={vi.fn()}
      />
    </MemoryRouter>
  );
}

async function itemRows() {
  const list = await screen.findByRole('list');
  return within(list).getAllByRole('listitem');
}

describe('PublicContractDetailModal — contents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureClipboard(null);
    loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  });

  it('shows one line per item, not one per hangar stack ESI happened to report', async () => {
    showItems([
      item({ record_id: 1, quantity: 1 }),
      item({ record_id: 2, quantity: 2 }),
      item({ record_id: 3, quantity: 2 }),
    ]);
    renderModal();

    const rows = await itemRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Large Skill Injector');
    expect(rows[0]).toHaveTextContent('×5');
  });

  it('wraps a long location name instead of cutting it off', async () => {
    const long = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant '.repeat(2).trim();
    loadContractLocationName.mockResolvedValue(long);
    renderModal({ id: 30000142, name: 'Jita' });
    const value = (await screen.findByText(long)).closest('dd')!;
    expect(value).not.toHaveClass('truncate');
    expect(value).toHaveClass('break-words');
    for (const label of ['Region', 'System']) {
      expect(screen.getByText(label).nextElementSibling).not.toHaveClass('truncate');
    }
  });

  it('links the location name to its Place Info', async () => {
    renderModal();
    expect(
      await screen.findByRole('link', { name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' })
    ).toHaveAttribute('href', expect.stringContaining('info=place-60003760'));
  });

  it('shows the unknown-location text without a link when the name did not resolve', async () => {
    loadContractLocationName.mockResolvedValue(null as unknown as string);
    renderModal();
    expect(await screen.findByText(/60003760/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /60003760/ })).toBeNull();
  });

  it('gives every line the item icon', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal();

    const rows = await itemRows();
    expect(within(rows[0]).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      expect.stringContaining('/types/40520/icon')
    );
  });

  it('names both sides of a swap instead of tagging one line inside the other side', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10, is_included: false }),
    ]);
    renderModal();

    expect(await screen.findByText('What you get')).toBeInTheDocument();
    expect(screen.getByText('What you hand over')).toBeInTheDocument();
    expect(screen.queryByText('Everything on this contract')).not.toBeInTheDocument();
  });

  it('puts what the contract asks for ahead of what the buyer gets', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10, is_included: false }),
    ]);
    renderModal();

    const get = await screen.findByText('What you get');
    const handOver = screen.getByText('What you hand over');
    expect(handOver.compareDocumentPosition(get) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the plain heading when the contract only hands things over', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal();

    expect(await screen.findByText('Everything on this contract')).toBeInTheDocument();
    expect(screen.queryByText('What you hand over')).not.toBeInTheDocument();
  });

  it('still says which side it is when every line is something the reader must supply', async () => {
    showItems([item({ record_id: 1, is_included: false })]);
    renderModal();

    expect(await screen.findByText('What you hand over')).toBeInTheDocument();
    expect(screen.queryByText('Everything on this contract')).not.toBeInTheDocument();
  });

  it('copies the contract ID on request, so nobody selects it by hand', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    configureClipboard(writeText);
    showItems([item({ record_id: 1 })]);
    renderModal();

    await user.click(await screen.findByRole('button', { name: 'Copy contract ID' }));

    expect(writeText).toHaveBeenCalledWith('235091192');
  });

  it('announces the copy to screen readers', async () => {
    const user = userEvent.setup();
    configureClipboard(vi.fn(async () => undefined));
    showItems([item({ record_id: 1 })]);
    renderModal();

    await user.click(await screen.findByRole('button', { name: 'Copy contract ID' }));

    const status = await screen.findByText('Contract ID copied');
    expect(status).toHaveAttribute('role', 'status');
  });

  it('prices each side at the trade hub, so the asking price has something to sit against', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10, is_included: false }),
    ]);
    renderModal();

    // 5 injectors at 1b, 10 extractors at 100m — whole ISK, since cents on a
    // billion-ISK bundle are noise. Sell orders: what taking it outright costs.
    const check = await screen.findByRole('region', { name: 'Is it fair? · Jita 4-4 right now' });
    expect(await within(check).findByText('5,000,000,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('1,000,000,000 ISK')).toBeInTheDocument();
  });

  it('says so when ESI no longer lists the contract', async () => {
    loadPublicContractItems.mockResolvedValue({ data: { kind: 'not-found' } });
    renderModal();

    expect(await screen.findByText('Contract no longer listed')).toBeInTheDocument();
  });
});

describe('PublicContractDetailModal — price check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureClipboard(null);
    loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  });

  it('opens on sell orders, what buying it outright costs, against the ask', async () => {
    showItems([item({ record_id: 1, quantity: 5 })]);
    renderModal(null, { askingIsk: 4_500_000_000 });

    const check = await screen.findByRole('region', { name: 'Is it fair? · Jita 4-4 right now' });
    expect(await within(check).findByText('5,000,000,000 ISK')).toBeInTheDocument();
    expect(within(check).getByRole('button', { name: 'Sell orders' })).toBeInTheDocument();
    expect(within(check).getByText('−10.0%')).toBeInTheDocument();
    expect(within(check).getByText('Asking is below sell orders')).toBeInTheDocument();
  });

  it('flips to buy orders from the side label and the figures follow', async () => {
    showItems([item({ record_id: 1, quantity: 5 })]);
    renderModal(null, { askingIsk: 4_500_000_000 });

    const check = await screen.findByRole('region', { name: /^Is it fair/ });
    await within(check).findByText('5,000,000,000 ISK');
    fireEvent.click(within(check).getByRole('button', { name: 'Sell orders' }));
    expect(within(check).getByRole('button', { name: 'Buy orders' })).toBeInTheDocument();
    expect(within(check).getAllByText('4,500,000,000 ISK')).toHaveLength(2); // asking and buy value
    expect(within(check).getByText('Asking is level with buy orders')).toBeInTheDocument();
  });

  it('tags the line the shopper searched for and splits the value into theirs and the rest', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10 }),
    ]);
    renderModal(null, { askingIsk: 6_000_000_000, searchedTypeIds: new Set([40520]) });

    const rows = await itemRows();
    expect(rows[0]).toHaveTextContent('Your search');
    expect(rows[1]).not.toHaveTextContent('Your search');
    const check = await screen.findByRole('region', { name: /^Is it fair/ });
    expect(await within(check).findByText('5,000,000,000 ISK')).toBeInTheDocument(); // theirs
    expect(within(check).getByText('1,000,000,000 ISK')).toBeInTheDocument(); // the rest
    expect(within(check).getByText('1 line you did not search for')).toBeInTheDocument();
  });

  it('tags nothing when no search is active', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10 }),
    ]);
    renderModal(null, { askingIsk: 6_000_000_000, searchedTypeIds: null });

    const rows = await itemRows();
    expect(rows[0]).not.toHaveTextContent('Your search');
    const check = await screen.findByRole('region', { name: /^Is it fair/ });
    expect(await within(check).findAllByText('6,000,000,000 ISK')).toHaveLength(2); // ask and value
    expect(within(check).queryByText('Other items')).not.toBeInTheDocument();
  });

  it("never prices a blueprint copy at the original's hub price, so a copy-only listing has no hub check", async () => {
    // 40520 has a hub price (1b sell), but only the original trades; a copy never does.
    showItems([
      item({
        record_id: 1,
        is_blueprint_copy: true,
        material_efficiency: 10,
        time_efficiency: 16,
        runs: 1,
      }),
    ]);
    renderModal(null, { askingIsk: 500_000 });

    await itemRows();
    expect(screen.queryByRole('region', { name: /^Is it fair/ })).not.toBeInTheDocument();
    expect(screen.queryByText('1,000,000,000 ISK')).not.toBeInTheDocument();
  });

  it('leaves a copy out of the figure and counts it unpriced when it sits beside priced items', async () => {
    showItems([
      item({
        record_id: 1,
        is_blueprint_copy: true,
        material_efficiency: 10,
        time_efficiency: 16,
        runs: 1,
      }),
      item({ record_id: 2, type_id: 40519, quantity: 10 }),
    ]);
    renderModal(null, { askingIsk: 50_000_000 });

    const check = await screen.findByRole('region', { name: /^Is it fair/ });
    expect(await within(check).findByText('1,000,000,000 ISK')).toBeInTheDocument(); // 10 x 100m, the item only
    expect(within(check).getByText('(1 item unpriced)')).toBeInTheDocument();
  });

  it('has no price check for a contract with no ISK ask and nothing requested', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal(null, { askingIsk: null });

    await itemRows();
    expect(screen.queryByRole('region', { name: /^Is it fair/ })).not.toBeInTheDocument();
  });

  it('shows a blueprint listing per run against similar copies, with no buy/sell flip', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal(null, {
      bpcCheck: {
        perRun: 850_000,
        medianPerRun: 920_000,
        cheapestPerRun: 790_000,
        count: 14,
        diff: -7.6,
      },
    });

    const check = await screen.findByRole('region', {
      name: 'Is it fair? · 14 similar copies for sale now',
    });
    expect(within(check).getByText('850,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('920,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('790,000 ISK')).toBeInTheDocument();
    expect(within(check).getByText('−7.6%')).toBeInTheDocument();
    expect(within(check).getByText('Below the median per run')).toBeInTheDocument();
    expect(within(check).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says there are too few similar copies when the check could not be made', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal(null, { bpcCheck: null });

    expect(
      await screen.findByText('Too few similar copies for sale to compare with.')
    ).toBeInTheDocument();
  });

  it('marks the contract as public and shows its expiry beside the price', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal();

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });
});

describe('PublicContractDetailModal — item actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
  });

  it('right-clicks a line into the item actions the rest of the app offers', async () => {
    const user = userEvent.setup();
    showItems([item({ record_id: 1 })]);
    renderModal();

    const rows = await itemRows();
    await user.pointer({ keys: '[MouseRight]', target: rows[0] });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('View in Market')).toBeInTheDocument();
    expect(within(menu).getByText('Add to Compare')).toBeInTheDocument();
    expect(within(menu).getByText('Copy name')).toBeInTheDocument();
  });

  it('opens that menu from the link inside the row, its only keyboard handle', async () => {
    showItems([item({ record_id: 1 })]);
    renderModal();

    const rows = await itemRows();
    // The row carries no `tabIndex` of its own; the Market link inside it is
    // what a keyboard reaches, and Shift+F10 there must reach the same menu.
    fireEvent.contextMenu(within(rows[0]).getByRole('link'));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});

describe('PublicContractDetailModal — system row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureClipboard(null);
    loadContractLocationName.mockResolvedValue('Jita IV - Moon 4 - Caldari Navy Assembly Plant');
    showItems([item({ record_id: 1 })]);
  });

  it('links the offer system to Route Safety when it is known', async () => {
    renderModal({ id: 30000142, name: 'Jita' });
    const link = await screen.findByRole('link', { name: 'Jita' });
    expect(link.getAttribute('href')).toContain('30000142');
  });

  it('has no System row when the system is unknown', async () => {
    renderModal(null);
    await screen.findByRole('list');
    expect(screen.queryByText('System')).not.toBeInTheDocument();
  });

  it('values an abyssal module at its own MutaMarket estimate, apart from the hub figure', async () => {
    mutamarket.getAbyssalEstimate.mockResolvedValue({
      status: 'priced',
      value: 90_000_000,
      source: 'mutamarket',
      fetchedAt: 0,
      valueUpdatedAt: null,
      url: 'https://mutamarket.com',
    });
    showItems([item({ record_id: 1, type_id: ABYSSAL_TYPE, item_id: 11 })]);
    renderModal();

    expect(await screen.findByText('Abyssal modules (MutaMarket estimate)')).toBeInTheDocument();
    expect(await screen.findByText('90,000,000')).toBeInTheDocument();
    expect(mutamarket.getAbyssalEstimate).toHaveBeenCalledWith(ABYSSAL_TYPE, 11, {
      characterId: 1,
    });
  });
});
