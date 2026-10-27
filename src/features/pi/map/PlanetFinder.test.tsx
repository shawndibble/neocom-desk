import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { PlanetFinder } from './PlanetFinder';

const nearest = vi.fn<(args: { highsecOnly: boolean }) => never[]>(() => []);
vi.mock('@/engine/pi/nearestPlanetTypes', () => ({
  nearestSystemsWithPlanetTypes: (args: { highsecOnly: boolean }) => nearest(args),
}));
vi.mock('@/sde/loadSde', () => ({ loadPiSystemPlanets: async () => ({}) }));
vi.mock('@/sde/jumpGraph', () => ({ loadJumpGraph: async () => new Map() }));
vi.mock('@/sde/solarSystems', () => ({ loadSolarSystemsById: async () => new Map() }));

function renderFinder(homeSecurity: number | null) {
  return render(
    <MemoryRouter>
      <PlanetFinder types={['lava']} homeSystemId={1} homeName="Home" homeSecurity={homeSecurity} />
    </MemoryRouter>
  );
}

describe('PlanetFinder "Highsec only" default', () => {
  it('is on from a highsec home', async () => {
    renderFinder(0.9);
    await waitFor(() => expect(nearest).toHaveBeenCalled());
    expect(screen.getByRole('checkbox', { name: 'Highsec only' })).toBeChecked();
    expect(nearest).toHaveBeenLastCalledWith(expect.objectContaining({ highsecOnly: true }));
  });

  it('is off from a nullsec home, and a toggle still wins', async () => {
    const user = userEvent.setup();
    nearest.mockClear();
    renderFinder(-0.4);
    await waitFor(() => expect(nearest).toHaveBeenCalled());
    const box = screen.getByRole('checkbox', { name: 'Highsec only' });
    expect(box).not.toBeChecked();
    expect(nearest).toHaveBeenLastCalledWith(expect.objectContaining({ highsecOnly: false }));
    await user.click(box);
    expect(box).toBeChecked();
  });

  it('is off when the home security is unknown', () => {
    renderFinder(null);
    expect(screen.getByRole('checkbox', { name: 'Highsec only' })).not.toBeChecked();
  });
});
