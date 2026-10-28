import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { QuickbarList, type QuickbarListProps } from './QuickbarList';
import { fakeItemActions, FakeItemActions } from './__fixtures__/itemActions';

const items = [{ typeId: 34, name: 'Tritanium', characterId: 1, position: 0 }];

function renderList(overrides: Partial<QuickbarListProps> = {}) {
  const props: QuickbarListProps = {
    items,
    selectedTypeId: null,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    onViewInAppraisal: vi.fn(),
    ...overrides,
  };
  const actions = fakeItemActions();
  render(
    <MemoryRouter>
      <FakeItemActions actions={actions}>
        <QuickbarList {...props} />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { ...props, actions };
}

describe('QuickbarList row controls', () => {
  it('has a ⋮ menu with Show info and Remove, and no bell or ×', async () => {
    const user = userEvent.setup();
    renderList();
    expect(screen.queryByRole('button', { name: /price alert/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove Tritanium/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions for Tritanium' }));
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveClass('text-danger');
  });

  it('opens the same menu on right-click', () => {
    renderList();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('Show info opens the item detail', async () => {
    const user = userEvent.setup();
    const { actions } = renderList();
    await user.click(screen.getByRole('button', { name: 'More actions for Tritanium' }));
    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(34, 'Tritanium');
  });

  it('Remove calls onRemove', async () => {
    const user = userEvent.setup();
    const props = renderList();
    await user.click(screen.getByRole('button', { name: 'More actions for Tritanium' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(props.onRemove).toHaveBeenCalledWith(34);
  });

  it('keeps the target text on the row', () => {
    renderList({
      items: [{ ...items[0], targetPrice: 5_000_000, targetDirection: 'above' }],
    });
    expect(screen.getByRole('button', { name: /^Tritanium/ })).toHaveTextContent('≥ 5M');
  });

  it('selects the item on a name click', async () => {
    const user = userEvent.setup();
    const props = renderList();
    await user.click(screen.getByRole('button', { name: 'Tritanium' }));
    expect(props.onSelect).toHaveBeenCalledWith(34);
  });
});

describe('QuickbarList selection', () => {
  it('marks only the selected row aria-current and gives it the selected treatment', () => {
    renderList({
      items: [...items, { typeId: 35, name: 'Pyerite', characterId: 1, position: 1 }],
      selectedTypeId: 34,
    });
    const selected = screen.getByRole('button', { name: 'Tritanium' });
    expect(selected).toHaveAttribute('aria-current', 'true');
    expect(selected.closest('li')).toHaveClass('border-l-accent');
    const other = screen.getByRole('button', { name: 'Pyerite' });
    expect(other).not.toHaveAttribute('aria-current');
    expect(other.closest('li')).not.toHaveClass('border-l-accent');
  });
});
