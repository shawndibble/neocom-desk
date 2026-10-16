import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

const loadReprocessing = vi.fn();
vi.mock('@/sde/loadSde', () => ({ loadReprocessing: () => loadReprocessing() }));
vi.mock('@/market/prices', () => ({ getHubPrices: async () => new Map() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: async () => new Map() }));
vi.mock('@/features/character/characterModifiers', () => ({
  loadCharacterModifiers: async () => ({ skills: {} }),
}));
vi.mock('@/features/industry/useIndustryWorkspace', () => ({
  useIndustryWorkspace: () => ({
    activeCharacterId: null,
    catalog: null,
    pi: null,
    ownedBlueprints: [],
    modifiers: { skills: {} },
    pricingInputs: {},
  }),
}));
vi.mock('@/features/industry/useComparedBuildResults', () => ({
  useComparedBuildResults: () => [],
}));
vi.mock('@/features/miningTax/OreIcon', () => ({
  OreIcon: () => null,
  OreLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { OreDecisionDialog } from './OreDecisionDialog';

function renderDialog() {
  return render(
    <MemoryRouter>
      <OreDecisionDialog open onClose={vi.fn()} typeId={1230} itemName="Veldspar" quantity={100} />
    </MemoryRouter>
  );
}

beforeEach(() => loadReprocessing.mockReset());

describe('OreDecisionDialog', () => {
  it('says the reprocessing data is not downloaded, instead of pricing forever, and loads on Try again', async () => {
    loadReprocessing.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      '1230': { portionSize: 100, materials: [{ typeID: 34, quantity: 415 }] },
    });
    renderDialog();

    expect(
      (await screen.findAllByText("Reprocessing data isn't downloaded yet")).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Pricing this ore…')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() =>
      expect(screen.queryByText("Reprocessing data isn't downloaded yet")).toBeNull()
    );
    expect(loadReprocessing).toHaveBeenCalledTimes(2);
  });
});
