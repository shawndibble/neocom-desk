import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ItemContextMenu, ItemMoreActions } from '@/features/market/ItemContextMenu';
import { BuildRecipeModal } from './BuildRecipeModal';
import type { BuildRecipe } from './subBuildPlan';

const NAMES: Record<number, string> = {
  9840: 'Mechanical Parts',
  34: 'Tritanium',
  35: 'Pyerite',
};
const nameFor = (typeID: number) => NAMES[typeID] ?? `#${typeID}`;

const RECIPE: BuildRecipe = {
  typeID: 9840,
  runs: 2,
  outputPerRun: 1,
  unitsMade: 2,
  needed: 2,
  spare: 0,
  me: 10,
  seconds: 1200,
  jobFees: 500,
  unitCost: 250,
  inputs: [
    {
      typeID: 34,
      baseQuantity: 100,
      quantity: 100,
      ownedQuantity: 0,
      remainingQuantity: 100,
      unitPrice: 5,
      lineCost: 500,
      unpriced: false,
      built: false,
    },
    {
      typeID: 35,
      baseQuantity: 50,
      quantity: 50,
      ownedQuantity: 0,
      remainingQuantity: 50,
      unitPrice: 10,
      lineCost: 500,
      unpriced: false,
      built: true,
    },
  ],
};

function itemMenuFor(typeId: number, trigger: React.ReactElement) {
  return (
    <ItemContextMenu
      typeId={typeId}
      itemName={nameFor(typeId)}
      blueprintTypeID={null}
      onAddToQuickbar={vi.fn()}
      quickbarAvailable
      onShowInfo={vi.fn()}
    >
      {trigger}
    </ItemContextMenu>
  );
}

function itemActionsFor(typeId: number) {
  return (
    <ItemMoreActions
      typeId={typeId}
      itemName={nameFor(typeId)}
      blueprintTypeID={null}
      onAddToQuickbar={vi.fn()}
      quickbarAvailable
      onShowInfo={vi.fn()}
    />
  );
}

function renderModal(overrides: Partial<React.ComponentProps<typeof BuildRecipeModal>> = {}) {
  return render(
    <MemoryRouter>
      <BuildRecipeModal
        recipe={RECIPE}
        onClose={vi.fn()}
        nameFor={nameFor}
        onOpenRecipe={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe('BuildRecipeModal', () => {
  it('renders nothing open when recipe is null', () => {
    renderModal({ recipe: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the recipe summary, ingredient rows and job stats', () => {
    renderModal();
    expect(screen.getByText(/How to build Mechanical Parts/)).toBeInTheDocument();
    expect(screen.getByText('Tritanium')).toBeInTheDocument();
    expect(screen.getByText('Pyerite')).toBeInTheDocument();
    // The built input gets its own "Build it" link into that material's recipe.
    expect(screen.getByRole('button', { name: 'Build it' })).toBeInTheDocument();
  });

  it('opens the input’s own recipe when its "Build it" button is clicked', async () => {
    const onOpenRecipe = vi.fn();
    renderModal({ onOpenRecipe });
    await userEvent.click(screen.getByRole('button', { name: 'Build it' }));
    expect(onOpenRecipe).toHaveBeenCalledWith(35);
  });
});

describe('BuildRecipeModal: title actions button (issue #1498)', () => {
  it('renders a focusable "More actions" button beside the title', () => {
    renderModal({ itemActionsFor });
    expect(
      screen.getByRole('button', { name: 'More actions for Mechanical Parts' })
    ).toBeInTheDocument();
  });

  it('opens the identical item menu the title’s right-click path opens', async () => {
    const user = userEvent.setup();
    renderModal({ itemMenuFor, itemActionsFor });

    fireEvent.contextMenu(screen.getByText('How to build Mechanical Parts'));
    const contextMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'More actions for Mechanical Parts' }));
    const buttonMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();

    expect(buttonMenuItems).toEqual(contextMenuItems);
  });

  it('renders nothing beside the title without itemActionsFor', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});

describe('BuildRecipeModal: ingredient row actions button (issue #1498)', () => {
  it('renders a "More actions" button per ingredient row', () => {
    renderModal({ itemActionsFor });
    expect(screen.getByRole('button', { name: 'More actions for Tritanium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions for Pyerite' })).toBeInTheDocument();
  });

  it('opens the identical item menu a row’s right-click path opens', async () => {
    const user = userEvent.setup();
    renderModal({ itemMenuFor, itemActionsFor });

    const tritaniumRow = screen.getByText('Tritanium').closest('li')!;
    fireEvent.contextMenu(tritaniumRow);
    const contextMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'More actions for Tritanium' }));
    const buttonMenuItems = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
      .sort();

    expect(buttonMenuItems).toEqual(contextMenuItems);
  });
});
