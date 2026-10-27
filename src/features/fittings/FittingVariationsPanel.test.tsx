import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { FittingVariationsPanel, type FittingVariationsPanelProps } from './FittingVariationsPanel';
import { fakeItemActions, FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import type { VariationRow } from './useModuleVariations';

const ROWS: VariationRow[] = [
  {
    typeId: 2873,
    name: '200mm AutoCannon II',
    metaGroupName: 'Tech II',
    delta: null,
    fits: null,
    overage: null,
    canFly: null,
    price: null,
  },
];

function defaultProps(
  overrides: Partial<FittingVariationsPanelProps> = {}
): FittingVariationsPanelProps {
  return {
    rows: ROWS,
    onSelect: vi.fn(),
    ...overrides,
  };
}

/** ItemContextMenu calls useNavigate/useLocation unconditionally, so a non-empty render needs a Router ancestor. */
function renderPanel(overrides: Partial<FittingVariationsPanelProps> = {}) {
  const actions = fakeItemActions();
  const result = render(
    <MemoryRouter>
      <FakeItemActions actions={actions}>
        <FittingVariationsPanel {...defaultProps(overrides)} />
      </FakeItemActions>
    </MemoryRouter>
  );
  return { ...result, actions };
}

describe('FittingVariationsPanel', () => {
  it('still swaps the module in on a left-click row select', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderPanel({ onSelect });
    const row = screen.getByText('200mm AutoCannon II').closest('tr');
    if (!row) throw new Error('expected a row');
    await user.click(row);
    expect(onSelect).toHaveBeenCalledWith(2873);
  });

  it('opens an item context menu with Show info on right-click', async () => {
    const user = userEvent.setup();
    const { actions } = renderPanel();
    const row = screen.getByText('200mm AutoCannon II').closest('tr');
    if (!row) throw new Error('expected a row');
    fireEvent.contextMenu(row);
    const showInfo = await screen.findByRole('menuitem', { name: 'Show info' });
    await user.click(showInfo);
    expect(actions.showInfo).toHaveBeenCalledWith(2873, '200mm AutoCannon II');
  });

  it('right-click opens the menu without also swapping the module in', () => {
    const onSelect = vi.fn();
    renderPanel({ onSelect });
    const row = screen.getByText('200mm AutoCannon II').closest('tr');
    if (!row) throw new Error('expected a row');
    fireEvent.contextMenu(row);
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
