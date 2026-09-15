import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { findLpOfferMatches } from '@/features/market/appraisalLpAcquisition';
import { BlueprintAcquisitionModal, type AcquisitionOwnedCopy } from './BlueprintAcquisitionModal';

vi.mock('@/features/market/appraisalLpAcquisition', () => ({ findLpOfferMatches: vi.fn() }));

const mockedFindLpOfferMatches = vi.mocked(findLpOfferMatches);

afterEach(() => vi.clearAllMocks());

const ASTERO_BPC_OFFER: LoyaltyStoreOffer = {
  offer_id: 1,
  type_id: 33468,
  quantity: 1,
  isk_cost: 12_000_000,
  lp_cost: 950_000,
  required_items: [],
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof BlueprintAcquisitionModal>> = {}
) {
  const props: React.ComponentProps<typeof BlueprintAcquisitionModal> = {
    onClose: vi.fn(),
    characterId: 1,
    blueprintTypeID: 33468,
    blueprintName: 'Astero Blueprint',
    ownedCopies: [] as readonly AcquisitionOwnedCopy[],
    sourcing: undefined,
    onSourcingChange: vi.fn(),
    onSearchBpcSourcing: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <BlueprintAcquisitionModal {...props} />
    </MemoryRouter>
  );
}

describe('BlueprintAcquisitionModal — LP Store section', () => {
  it('shows nothing while no LP corp sells this blueprint', async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map(),
      requiredItemTypeIds: [],
    });
    renderModal();
    await waitFor(() => expect(mockedFindLpOfferMatches).toHaveBeenCalled());
    expect(screen.queryByText('LP Store')).not.toBeInTheDocument();
  });

  it('names the corp and price when an LP store sells this blueprint', async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map([
        [
          33468,
          [
            {
              corporationId: 1000125,
              corpName: 'Sisters of EVE',
              offer: ASTERO_BPC_OFFER,
              playerLp: 1_000_000,
            },
          ],
        ],
      ]),
      requiredItemTypeIds: [],
    });

    renderModal();

    expect(await screen.findByText('LP Store')).toBeInTheDocument();
    expect(screen.getByText(/Sisters of EVE/)).toBeInTheDocument();
    expect(screen.getByText(/12,000,000 ISK \+ 950,000 LP/)).toBeInTheDocument();
  });

  it("links to the offering corp's LP Store page", async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map([
        [
          33468,
          [
            {
              corporationId: 1000125,
              corpName: 'Sisters of EVE',
              offer: ASTERO_BPC_OFFER,
              playerLp: 1_000_000,
            },
          ],
        ],
      ]),
      requiredItemTypeIds: [],
    });

    renderModal();

    const link = await screen.findByRole('link', { name: /Sisters of EVE/ });
    expect(link).toHaveAttribute('href', '/wallet/loyalty/1000125');
  });

  it('lists every corp that sells it, when more than one does', async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map([
        [
          33468,
          [
            {
              corporationId: 1000125,
              corpName: 'Sisters of EVE',
              offer: ASTERO_BPC_OFFER,
              playerLp: 1_000_000,
            },
            {
              corporationId: 1000126,
              corpName: 'Other Corp',
              offer: { ...ASTERO_BPC_OFFER, isk_cost: 10_000_000 },
              playerLp: 500_000,
            },
          ],
        ],
      ]),
      requiredItemTypeIds: [],
    });

    renderModal();

    const heading = await screen.findByText('LP Store');
    const section = heading.closest('section')!;
    expect(within(section).getByText(/Sisters of EVE/)).toBeInTheDocument();
    expect(within(section).getByText(/Other Corp/)).toBeInTheDocument();
  });

  it('notes a redemption that hands over more than one copy', async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map([
        [
          33468,
          [
            {
              corporationId: 1000125,
              corpName: 'Sisters of EVE',
              offer: { ...ASTERO_BPC_OFFER, quantity: 3 },
              playerLp: 1_000_000,
            },
          ],
        ],
      ]),
      requiredItemTypeIds: [],
    });

    renderModal();

    expect(await screen.findByText(/3 copies per redemption/)).toBeInTheDocument();
  });

  it('notes when the offer also demands a turn-in item', async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map([
        [
          33468,
          [
            {
              corporationId: 1000125,
              corpName: 'Sisters of EVE',
              offer: { ...ASTERO_BPC_OFFER, required_items: [{ type_id: 44992, quantity: 5 }] },
              playerLp: 1_000_000,
            },
          ],
        ],
      ]),
      requiredItemTypeIds: [44992],
    });

    renderModal();

    expect(await screen.findByText(/plus 1 turn-in item/)).toBeInTheDocument();
  });

  it("looks up matches by the blueprint's own typeID, for the given character", async () => {
    mockedFindLpOfferMatches.mockResolvedValue({
      matchesByTypeId: new Map(),
      requiredItemTypeIds: [],
    });
    renderModal({ characterId: 42, blueprintTypeID: 999 });
    await waitFor(() => expect(mockedFindLpOfferMatches).toHaveBeenCalledWith(42, [999]));
  });
});
