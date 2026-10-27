import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';

const loadBlueprintCatalog = vi.fn();
vi.mock('@/features/industry/blueprintCatalog', () => ({
  loadBlueprintCatalog: () => loadBlueprintCatalog(),
}));
vi.mock('@/features/market/itemActions', () => ({
  useItemActions: () => ({ showInfo: vi.fn() }),
}));
vi.mock('@/features/industry/data', () => ({
  loadCharacterBlueprints: async () => ({ cached: { data: [] } }),
  findOwnedBlueprint: () => null,
}));

import { StockBuilderView } from './StockBuilderView';

const CATALOG = {
  byProductTypeID: new Map(),
  byBlueprintTypeID: new Map(),
} as unknown as BlueprintCatalog;

function renderView() {
  return render(
    <MemoryRouter>
      <StockBuilderView
        rows={[]}
        nameOf={(id) => `#${id}`}
        listName="Ammo"
        activeCharacterId={null}
      />
    </MemoryRouter>
  );
}

beforeEach(() => loadBlueprintCatalog.mockReset());

describe('StockBuilderView', () => {
  it('says the blueprint data could not load, then loads it on Try again', async () => {
    loadBlueprintCatalog.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(CATALOG);
    renderView();
    expect((await screen.findAllByText("Blueprint data couldn't load")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(screen.queryByText("Blueprint data couldn't load")).toBeNull());
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(2);
  });
});
