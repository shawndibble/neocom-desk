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
  getHubPrices: vi.fn(
    async () =>
      new Map([
        [40520, { sellMin: 1_000_000_000, buyMax: null }],
        [40519, { sellMin: 100_000_000, buyMax: null }],
      ])
  ),
}));

function item(overrides: Partial<PublicContractItem> & { record_id: number }): PublicContractItem {
  return { type_id: 40520, quantity: 1, is_included: true, ...overrides };
}

function showItems(items: PublicContractItem[]) {
  loadPublicContractItems.mockResolvedValue({ data: { kind: 'items', items } });
}

function renderModal() {
  render(
    <MemoryRouter>
      <PublicContractDetailModal
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

    await user.click(await screen.findByRole('button', { name: 'Copy Contract ID' }));

    expect(writeText).toHaveBeenCalledWith('235091192');
  });

  it('prices each side at the trade hub, so the asking price has something to sit against', async () => {
    showItems([
      item({ record_id: 1, quantity: 5 }),
      item({ record_id: 2, type_id: 40519, quantity: 10, is_included: false }),
    ]);
    renderModal();

    // 5 injectors at 1b, 10 extractors at 100m — whole ISK, since cents on a
    // billion-ISK bundle are noise.
    expect(await screen.findByText('5,000,000,000')).toBeInTheDocument();
    expect(screen.getByText('1,000,000,000')).toBeInTheDocument();
  });

  it('says so when ESI no longer lists the contract', async () => {
    loadPublicContractItems.mockResolvedValue({ data: { kind: 'not-found' } });
    renderModal();

    expect(await screen.findByText('Contract no longer listed')).toBeInTheDocument();
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
