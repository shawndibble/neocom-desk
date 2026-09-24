import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { QuickbarList, type QuickbarListProps } from './QuickbarList';

const items = [{ typeId: 34, name: 'Tritanium', characterId: 1, position: 0 }];

function renderList(overrides: Partial<QuickbarListProps> = {}) {
  const props: QuickbarListProps = {
    items,
    selectedTypeId: null,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onSetTarget: vi.fn(),
    onViewInAppraisal: vi.fn(),
    onAddToQuickbar: vi.fn(),
    quickbarAvailable: true,
    onShowInfo: vi.fn(),
    blueprintTypeIdFor: () => null,
    onRequestBlueprintCatalog: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <QuickbarList {...props} />
    </MemoryRouter>
  );
  return props;
}

describe('QuickbarList item context menu', () => {
  it('opens the item menu on the name button without selecting the row', async () => {
    const props = renderList();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    expect(await screen.findByRole('menuitem', { name: /Show info/i })).toBeInTheDocument();
    expect(props.onRequestBlueprintCatalog).toHaveBeenCalled();
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('does not open it from the drag handle, price alert or remove buttons', () => {
    renderList();
    for (const name of [/Reorder/i, /price alert/i, /Remove/i]) {
      fireEvent.contextMenu(screen.getByRole('button', { name }));
    }
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
