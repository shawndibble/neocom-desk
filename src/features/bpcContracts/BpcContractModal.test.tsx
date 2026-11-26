import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BpcContractModal } from './BpcContractModal';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { PublicContractItem } from '@/esi/endpoints';
import type { BlueprintMap } from '@/sde/types';
import { LocationProbe } from '@/test/LocationProbe';

const BLUEPRINTS: BlueprintMap = {
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async (): Promise<BlueprintMap> => BLUEPRINTS),
}));

const loadContractLocationName =
  vi.fn<(characterId: number, locationId: number) => Promise<string | null>>();
vi.mock('@/features/character/contractLocationName', () => ({
  loadContractLocationName: (characterId: number, locationId: number) =>
    loadContractLocationName(characterId, locationId),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async () =>
      new Map([
        [638, 'Rifter Blueprint'],
        [34, 'Tritanium'],
      ])
  ),
}));

const loadPublicContractItems = vi.fn();
vi.mock('@/features/bpcContracts/publicContractItems', () => ({
  loadPublicContractItems: (...args: unknown[]) => loadPublicContractItems(...args),
}));

const ROW: BpcContractRow = {
  contractId: 12345,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 638,
  price: 5_000_000,
  isAuction: false,
  me: 10,
  te: 20,
  runs: 5,
  quantity: 1,
  dateExpired: Date.parse('2099-09-10T00:00:00Z'),
  isMultiType: false,
};

function items(list: PublicContractItem[]) {
  return {
    data: { kind: 'items' as const, items: list },
    fetchedAt: new Date(),
    fromCache: false,
    truncated: false,
  };
}

const CHARACTER_ID = 91;

function renderModal(row: BpcContractRow = ROW, comparables: readonly BpcContractRow[] = []) {
  return render(
    <MemoryRouter initialEntries={['/industry/sourcing']}>
      <BpcContractModal
        row={row}
        comparables={comparables}
        characterId={CHARACTER_ID}
        blueprintName="Rifter Blueprint"
        regionName="The Forge"
        onClose={() => {}}
      />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadContractLocationName.mockReset();
  loadContractLocationName.mockResolvedValue('Jita IV - Moon 4');
  loadPublicContractItems.mockReset();
  loadPublicContractItems.mockResolvedValue(
    items([
      {
        record_id: 1,
        type_id: 638,
        quantity: 1,
        is_included: true,
        is_blueprint_copy: true,
        material_efficiency: 10,
        time_efficiency: 20,
        runs: 5,
      },
      { record_id: 2, type_id: 34, quantity: 744, is_included: true },
    ])
  );
});

describe('BpcContractModal — where the contract is', () => {
  it('names a contract sitting in a player structure (issue #655 item F)', async () => {
    loadContractLocationName.mockResolvedValue('1DQ1-A - 1-st Imperial Palace');
    const structureRow: BpcContractRow = { ...ROW, locationId: 1022734985679 };

    renderModal(structureRow);

    expect(await screen.findByText('1DQ1-A - 1-st Imperial Palace')).toBeInTheDocument();
    expect(loadContractLocationName).toHaveBeenCalledWith(CHARACTER_ID, 1022734985679);
  });

  it('falls back to the id when the location resolves to nothing', async () => {
    loadContractLocationName.mockResolvedValue(null);

    renderModal();

    expect(await screen.findByText('Unknown location (#60003760)')).toBeInTheDocument();
  });
});

describe('BpcContractModal — contract no longer listed', () => {
  it('shows a distinct message for a 404 rather than the generic load-failed one', async () => {
    loadPublicContractItems.mockResolvedValue({
      data: { kind: 'not-found' as const },
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    });

    renderModal();

    expect(await screen.findByText('Contract no longer listed')).toBeInTheDocument();
    expect(screen.queryByText('Could not load')).not.toBeInTheDocument();
  });
});

describe('BpcContractModal — Build Plan context menu', () => {
  it('right-clicking a blueprint line starts a Build Plan seeded at that line’s ME/TE/runs', async () => {
    renderModal();

    const contents = await screen.findByRole('list');
    fireEvent.contextMenu(within(contents).getByText('Rifter Blueprint'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry/plans?product=587&me=10&te=20&runs=5'
    );
  });

  it('seeds the same line identically on a second click, the key Industry’s reuse rule matches on', async () => {
    renderModal();
    const contents = await screen.findByRole('list');
    const line = within(contents).getByText('Rifter Blueprint');

    for (let i = 0; i < 2; i++) {
      fireEvent.contextMenu(line);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/industry/plans?product=587&me=10&te=20&runs=5'
      );
    }
  });

  it('falls back to the unseeded menu when ESI omits one of the copy’s numbers', async () => {
    loadPublicContractItems.mockResolvedValue(
      items([
        {
          record_id: 1,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 10,
          time_efficiency: 20,
        },
      ])
    );
    renderModal();

    const contents = await screen.findByRole('list');
    fireEvent.contextMenu(within(contents).getByText('Rifter Blueprint'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/industry/plans?product=587');
    expect(screen.getByTestId('location')).not.toHaveTextContent('me=');
  });

  it('seeds two bundled copies at different research to different plans', async () => {
    loadPublicContractItems.mockResolvedValue(
      items([
        {
          record_id: 1,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 10,
          time_efficiency: 20,
          runs: 5,
        },
        {
          record_id: 2,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 2,
          time_efficiency: 4,
          runs: 1,
        },
      ])
    );
    renderModal();

    const contents = await screen.findByRole('list');
    const rows = within(contents).getAllByText('Rifter Blueprint');
    expect(rows).toHaveLength(2);

    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry/plans?product=587&me=10&te=20&runs=5'
    );

    fireEvent.contextMenu(rows[1]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry/plans?product=587&me=2&te=4&runs=1'
    );
  });

  it('disables the action on a bundled item nothing builds', async () => {
    renderModal();

    fireEvent.contextMenu(await screen.findByText('Tritanium'));

    const item = await screen.findByRole('menuitem', { name: 'No blueprint options' });
    expect(item).toHaveAttribute('data-disabled');
  });

  describe('price check', () => {
    const similar = (contractId: number, price: number): BpcContractRow => ({
      ...ROW,
      contractId,
      price,
    });

    it('holds the copy per run against similar copies, with the median and the cheapest', async () => {
      renderModal(ROW, [ROW, similar(2, 4_000_000), similar(3, 5_500_000), similar(4, 6_000_000)]);

      const check = await screen.findByRole('region', {
        name: 'Is it fair? · 3 similar copies for sale now',
      });
      expect(within(check).getByText('1,000,000 ISK')).toBeInTheDocument();
      expect(within(check).getByText('1,100,000 ISK')).toBeInTheDocument();
      expect(within(check).getByText('800,000 ISK')).toBeInTheDocument();
      expect(within(check).getByText('+9.1%')).toBeInTheDocument();
      expect(within(check).getByText('Below the median. You save.')).toBeInTheDocument();
    });

    it('says there are too few similar copies when fewer than three are for sale', async () => {
      renderModal(ROW, [ROW, similar(2, 4_000_000)]);
      expect(
        await screen.findByText('Too few similar copies for sale to compare with.')
      ).toBeInTheDocument();
    });

    it('puts the per-run price beside the asking price in the header', async () => {
      renderModal(ROW, []);
      expect(await screen.findByText('Per run')).toBeInTheDocument();
      expect(screen.getAllByText('1,000,000')).not.toHaveLength(0);
    });

    it('tags the blueprint itself as the line that was searched for', async () => {
      renderModal(ROW, []);
      const rows = await screen.findAllByRole('listitem');
      expect(rows[0]).toHaveTextContent('Your search');
      expect(rows[1]).not.toHaveTextContent('Your search');
    });
  });
});
