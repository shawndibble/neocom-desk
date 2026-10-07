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
    onSetTarget: vi.fn(),
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
  it('has no item menu and no More actions button: the bell and × are its controls', () => {
    renderList();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument();
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
