import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { PiData } from '@/sde/types';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => pi),
}));

const { ItemContextMenu, ItemMoreActions } = await import('./ItemContextMenu');

const BROADCAST_NODE = 2867; // P4 planetary commodity
const TRITANIUM = 34; // manufactured from nothing planetary

function CurrentLocation() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderMenu(typeId: number, itemName: string) {
  return render(
    <MemoryRouter initialEntries={['/market']}>
      <CurrentLocation />
      <ItemContextMenu
        typeId={typeId}
        itemName={itemName}
        blueprintTypeID={null}
        onAddToQuickbar={vi.fn()}
        quickbarAvailable
        onShowInfo={vi.fn()}
      >
        <button type="button">{itemName}</button>
      </ItemContextMenu>
    </MemoryRouter>
  );
}

describe('ItemContextMenu — build-here toggle', () => {
  it("omits the action when the caller supplies nothing — most items are never a plan's own materials", async () => {
    renderMenu(TRITANIUM, 'Tritanium');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    await screen.findByRole('menuitem', { name: /Build Plan|No blueprint options/ });
    expect(
      screen.queryByRole('menuitem', { name: /Add material components|Buy instead/ })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['Add material components', 'Buy instead', false],
    ['Buy instead', 'Add material components', true],
  ])('offers "%s" and invokes it on select', async (offeredLabel, omittedLabel, buildingHere) => {
    const onToggleBuildHere = vi.fn();
    render(
      <MemoryRouter initialEntries={['/industry']}>
        <ItemContextMenu
          typeId={TRITANIUM}
          itemName="Tritanium"
          blueprintTypeID={null}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable
          onShowInfo={vi.fn()}
          onToggleBuildHere={onToggleBuildHere}
          buildingHere={buildingHere}
        >
          <button type="button">Tritanium</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    const item = await screen.findByRole('menuitem', { name: offeredLabel });
    fireEvent.click(item);

    expect(onToggleBuildHere).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: omittedLabel })).not.toBeInTheDocument();
  });
});

describe('ItemContextMenu — View in Industry as material (issue #414)', () => {
  it('offers the action when the caller supplies it, and invokes it on select', async () => {
    const onViewInIndustryAsMaterial = vi.fn();
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <ItemContextMenu
          typeId={TRITANIUM}
          itemName="Tritanium"
          blueprintTypeID={null}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable
          onShowInfo={vi.fn()}
          onViewInIndustryAsMaterial={onViewInIndustryAsMaterial}
        >
          <button type="button">Tritanium</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    const item = await screen.findByRole('menuitem', { name: 'View in Industry as material' });
    fireEvent.click(item);

    expect(onViewInIndustryAsMaterial).toHaveBeenCalledTimes(1);
  });

  it('omits the action when the caller supplies nothing (unknown, or no plan consumes it)', async () => {
    renderMenu(TRITANIUM, 'Tritanium');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    await screen.findByRole('menuitem', { name: /Build Plan|No blueprint options/ });
    expect(
      screen.queryByRole('menuitem', { name: 'View in Industry as material' })
    ).not.toBeInTheDocument();
  });
});

describe('ItemContextMenu — PI Plan', () => {
  it('offers a PI Plan for a planetary commodity and lands on the plan tab', async () => {
    renderMenu(BROADCAST_NODE, 'Broadcast Node');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Broadcast Node' }));

    const item = await screen.findByRole('menuitem', { name: 'PI Plan' });
    fireEvent.click(item);

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/planetary-industry/plan?type=${BROADCAST_NODE}`
    );
  });

  it('leaves the menu alone for an item planetary industry cannot make', async () => {
    renderMenu(TRITANIUM, 'Tritanium');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    // The Build Plan action is the last one to render, so its presence means
    // the menu is fully painted and a missing PI Plan is a real absence.
    expect(
      await screen.findByRole('menuitem', { name: /Build Plan|No blueprint options/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'PI Plan' })).not.toBeInTheDocument();
  });
});

describe('ItemContextMenu — price alert', () => {
  it('opens the alert dialog from the menu item', async () => {
    renderMenu(TRITANIUM, 'Tritanium');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Set price alert…' }));
    expect(await screen.findByRole('dialog', { name: 'Price alert: Tritanium' })).toBeTruthy();
  });
});

describe('ItemContextMenu — price alert availability', () => {
  it('disables the item with no active character', async () => {
    render(
      <MemoryRouter>
        <ItemContextMenu
          typeId={TRITANIUM}
          itemName="Tritanium"
          blueprintTypeID={null}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable={false}
          onShowInfo={vi.fn()}
        >
          <button type="button">Tritanium</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));
    const item = await screen.findByRole('menuitem', { name: 'Set price alert…' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});

// Issue #1498: every surface wrapping a row in `ItemContextMenu` renders this
// button beside it so the row has a keyboard path (WCAG 2.1.1) independent of
// the context-menu trigger.
describe('ItemMoreActions', () => {
  function renderMoreActions() {
    return render(
      <MemoryRouter initialEntries={['/market']}>
        <ItemMoreActions
          typeId={TRITANIUM}
          itemName="Tritanium"
          blueprintTypeID={null}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable
          onShowInfo={vi.fn()}
        />
      </MemoryRouter>
    );
  }

  it('gives the row a focusable "More actions" button naming its subject', () => {
    renderMoreActions();
    expect(screen.getByRole('button', { name: 'More actions for Tritanium' })).toBeInTheDocument();
  });

  it('opens the same items from the button as from the context menu', async () => {
    const user = userEvent.setup();
    renderMoreActions();

    await user.click(screen.getByRole('button', { name: 'More actions for Tritanium' }));
    const buttonItems = screen.getAllByRole('menuitem').map((el) => el.textContent);
    await user.keyboard('{Escape}');

    render(
      <MemoryRouter initialEntries={['/market']}>
        <ItemContextMenu
          typeId={TRITANIUM}
          itemName="Tritanium"
          blueprintTypeID={null}
          onAddToQuickbar={vi.fn()}
          quickbarAvailable
          onShowInfo={vi.fn()}
        >
          <button type="button">Tritanium context trigger</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium context trigger' }));
    const contextItems = await screen
      .findAllByRole('menuitem')
      .then((els) => els.map((el) => el.textContent));

    expect(buttonItems).toEqual(contextItems);
  });
});
