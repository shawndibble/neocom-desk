import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CourierResults } from '@/features/contractSearch/CourierResults';
import type { CourierEndpoint, CourierRouteRow } from '@/engine/contracts/courierSearch';

const loadCharacterRegionId = vi.fn<(characterId: number) => Promise<number | null>>();
vi.mock('@/features/contractSearch/characterRegion', () => ({
  loadCharacterRegionId: (characterId: number) => loadCharacterRegionId(characterId),
}));

// The jump graph is a route concern with its own tests; here it would only
// add an async settle to every case.
vi.mock('@/features/route/localRoute', () => ({
  localJumpCountsForRoutes: vi.fn(async () => ({ kind: 'unknown' })),
}));

const CHARACTER_ID = 42;
const THE_FORGE = 10000002;
const DOMAIN = 10000043;

function endpoint(regionId: number, name: string): CourierEndpoint {
  return {
    locationId: 60003760,
    name,
    systemName: 'Jita',
    systemId: 30000142,
    regionId,
    space: 'highsec',
  };
}

/** One haul out of The Forge — so The Forge is the only origin region on offer. */
const ROWS: readonly CourierRouteRow[] = [
  {
    contractId: 1,
    regionId: THE_FORGE,
    originLocationId: 60003760,
    destinationLocationId: 60008494,
    reward: 5_000_000,
    volume: 1_000,
    dateExpired: Date.now() + 86_400_000,
    origin: endpoint(THE_FORGE, 'Jita IV - Moon 4'),
    destination: endpoint(DOMAIN, 'Amarr VIII'),
  },
];

const REGION_NAMES = new Map([
  [THE_FORGE, 'The Forge'],
  [DOMAIN, 'Domain'],
]);

/** The bar is `collapsible`, so its controls live behind the funnel at pointer width. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }));
}

function renderBoard() {
  return render(
    <CourierResults rows={ROWS} regionNames={REGION_NAMES} characterId={CHARACTER_ID} />
  );
}

beforeEach(() => {
  loadCharacterRegionId.mockReset();
});

describe('CourierResults "From my region" shortcut', () => {
  it('names the region, not the station or system', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();

    await openFilters(user);

    expect(screen.getByRole('button', { name: 'From my region' })).toBeInTheDocument();
  });

  it('costs nothing until it is pressed, then exactly one lookup', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    expect(loadCharacterRegionId).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() => expect(loadCharacterRegionId).toHaveBeenCalledTimes(1));
  });

  it('sets the origin region filter from the character location', async () => {
    loadCharacterRegionId.mockResolvedValue(THE_FORGE);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('The Forge')
    );
  });

  it('never sets a region the dropdown has no option for, and says why', async () => {
    // The character is in Domain; no haul in the snapshot starts there.
    loadCharacterRegionId.mockResolvedValue(DOMAIN);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByText('No hauls start in your region')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });

  it('goes quietly unavailable when the location cannot be resolved', async () => {
    // What a character whose grant predates the location scope gets: a 403 the
    // loader reports as `null`, never a re-auth banner.
    loadCharacterRegionId.mockResolvedValue(null);
    const user = userEvent.setup();
    renderBoard();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'From my region' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'From my region' })).toBeDisabled()
    );
    // A reason, not a banner: a dead control with no explanation reads as broken.
    expect(screen.getByText('Your current location is unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No hauls start in your region')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'From region' })).toHaveTextContent('All regions');
  });
});
