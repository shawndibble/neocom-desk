import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { stubViewport } from '@/test/viewport';
import { AssetsFilterRow } from './AssetsFilterRow';
import {
  activeAssetKindFilters,
  buildCategoryIndex,
  type CategoryPick,
} from './assetCategoryFilter';
import type { AssetsData } from './useAssetsData';
import type { AssetsRows } from './useAssetsRows';

const index = buildCategoryIndex(
  [
    { id: 1, name: 'Ships', parentId: null, hasTypes: true },
    { id: 2, name: 'Blueprints & Reactions', parentId: null, hasTypes: true },
  ],
  [{ typeId: 100, name: 'Rifter', marketGroupId: 1, volume: 1 }],
  'Not on the market'
);

function setup() {
  const cat: CategoryPick = new Set([1]);
  const filterValue = { cat, bp: 'copy' as const, min: '' };
  const activeFilters = activeAssetKindFilters(
    filterValue,
    { index, showBlueprintSelect: true, categoryLabel: 'Category' },
    (key: string) => key
  ).map((f) => ({ ...f, inline: true }));
  const assetsData = {
    search: '',
    setSearch: vi.fn(),
    setView: vi.fn(),
    minValueInput: '',
    flatModeActive: true,
    categoryIndex: index,
    pickerIndex: index,
    categoryPick: cat,
    blueprintKind: 'copy',
    showBlueprintSelect: true,
    filterValue,
    activeFilters,
  } as unknown as AssetsData;
  const assetsRows = {
    searchRef: createRef<HTMLInputElement>(),
    sortField: 'name',
    setSortField: vi.fn(),
    rows: [],
  } as unknown as AssetsRows;
  return <AssetsFilterRow assetsData={assetsData} assetsRows={assetsRows} />;
}

describe('AssetsFilterRow', () => {
  it('shows Category and Blueprints in the row with no pill, Sort beside the funnel, Min value in the box', async () => {
    const user = userEvent.setup();
    render(setup());
    expect(screen.getByLabelText(/^Category/)).toBeInTheDocument();
    expect(screen.getByLabelText('Blueprints')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change filter/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum value')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByLabelText('Minimum value')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Category/)).toHaveLength(1);
  });

  it('puts every control in the sheet, with pills, on a phone', async () => {
    stubViewport(NARROW_QUERY);
    const user = userEvent.setup();
    render(setup());
    expect(screen.queryByLabelText(/^Category/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByLabelText(/^Category/)).toBeInTheDocument();
    expect(sheet.getByLabelText('Blueprints')).toBeInTheDocument();
    expect(sheet.getByLabelText('Minimum value')).toBeInTheDocument();
    expect(sheet.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
  });
});
