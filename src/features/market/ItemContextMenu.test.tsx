import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { PiData } from '@/sde/types';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { FakeItemActions, fakeItemActions } from './__fixtures__/itemActions';

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
      <FakeItemActions>
        <CurrentLocation />
        <ItemContextMenu typeId={typeId} itemName={itemName} blueprintTypeID={null}>
          <button type="button">{itemName}</button>
        </ItemContextMenu>
      </FakeItemActions>
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
        <FakeItemActions>
          <ItemContextMenu
            typeId={TRITANIUM}
            itemName="Tritanium"
            blueprintTypeID={null}
            onToggleBuildHere={onToggleBuildHere}
            buildingHere={buildingHere}
          >
            <button type="button">Tritanium</button>
          </ItemContextMenu>
        </FakeItemActions>
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
        <FakeItemActions>
          <ItemContextMenu
            typeId={TRITANIUM}
            itemName="Tritanium"
            blueprintTypeID={null}
            onViewInIndustryAsMaterial={onViewInIndustryAsMaterial}
          >
            <button type="button">Tritanium</button>
          </ItemContextMenu>
        </FakeItemActions>
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
        <FakeItemActions actions={fakeItemActions({ canAddToQuickbar: false })}>
          <ItemContextMenu typeId={TRITANIUM} itemName="Tritanium" blueprintTypeID={null}>
            <button type="button">Tritanium</button>
          </ItemContextMenu>
        </FakeItemActions>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));
    const item = await screen.findByRole('menuitem', { name: 'Set price alert…' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  // Issue #2162: a `title=` explanation is unreachable on a touch device,
  // which has no hover — the reason must be reachable by a tap instead.
  it.each([['Add to Quickbar'], ['Set price alert…']])(
    'reveals the disabled reason on a tap of "%s"',
    async (name) => {
      render(
        <MemoryRouter>
          <FakeItemActions actions={fakeItemActions({ canAddToQuickbar: false })}>
            <ItemContextMenu typeId={TRITANIUM} itemName="Tritanium" blueprintTypeID={null}>
              <button type="button">Tritanium</button>
            </ItemContextMenu>
          </FakeItemActions>
        </MemoryRouter>
      );
      fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

      const menuItem = await screen.findByRole('menuitem', { name });
      fireEvent.touchStart(menuItem, {
        touches: [{ clientX: 0, clientY: 0 }],
        changedTouches: [{ clientX: 0, clientY: 0 }],
      });
      fireEvent.touchEnd(menuItem);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Select a character to use the Quickbar'
      );
    }
  );

  it('does not add to the quickbar when the disabled item is tapped', async () => {
    const actions = fakeItemActions({ canAddToQuickbar: false });
    render(
      <MemoryRouter>
        <FakeItemActions actions={actions}>
          <ItemContextMenu typeId={TRITANIUM} itemName="Tritanium" blueprintTypeID={null}>
            <button type="button">Tritanium</button>
          </ItemContextMenu>
        </FakeItemActions>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));
    const item = await screen.findByRole('menuitem', { name: 'Add to Quickbar' });
    fireEvent.click(item);
    expect(actions.addToQuickbar).not.toHaveBeenCalled();
  });
});

// Issue #1498: every surface wrapping a row in `ItemContextMenu` renders this
// button beside it so the row has a keyboard path (WCAG 2.1.1) independent of
// the context-menu trigger.
describe('ItemMoreActions', () => {
  function renderMoreActions() {
    return render(
      <MemoryRouter initialEntries={['/market']}>
        <FakeItemActions>
          <ItemMoreActions typeId={TRITANIUM} itemName="Tritanium" blueprintTypeID={null} />
        </FakeItemActions>
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
        <FakeItemActions>
          <ItemContextMenu typeId={TRITANIUM} itemName="Tritanium" blueprintTypeID={null}>
            <button type="button">Tritanium context trigger</button>
          </ItemContextMenu>
        </FakeItemActions>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium context trigger' }));
    const contextItems = await screen
      .findAllByRole('menuitem')
      .then((els) => els.map((el) => el.textContent));

    expect(buttonItems).toEqual(contextItems);
  });
});

describe('ItemContextMenu — Item Actions', () => {
  const RIFTER = 587;
  const catalog = {
    byProductTypeID: new Map([[RIFTER, { blueprintTypeID: 691 }]]),
  } as unknown as BlueprintCatalog;

  function renderWith(
    actions: ReturnType<typeof fakeItemActions>,
    blueprintTypeID?: number | null
  ) {
    return render(
      <MemoryRouter>
        <FakeItemActions actions={actions}>
          <ItemContextMenu
            typeId={RIFTER}
            itemName="Rifter"
            {...(blueprintTypeID === undefined ? {} : { blueprintTypeID })}
          >
            <button type="button">Rifter</button>
          </ItemContextMenu>
        </FakeItemActions>
      </MemoryRouter>
    );
  }

  it("asks the page's Item Actions for the blueprint catalog as it opens, and says checking until it loads", async () => {
    const actions = fakeItemActions();
    renderWith(actions);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    expect(await screen.findByRole('menuitem', { name: 'Build Plan (checking…)' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(actions.requestBlueprints).toHaveBeenCalled();
  });

  it("offers Build Plan from the page's catalog once it has loaded", async () => {
    renderWith(fakeItemActions({ blueprints: catalog }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    expect(await screen.findByRole('menuitem', { name: 'Build Plan' })).not.toHaveAttribute(
      'aria-disabled'
    );
  });

  it('prefers a blueprint the row already knows over the page catalog', async () => {
    renderWith(fakeItemActions({ blueprints: catalog }), null);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    expect(
      await screen.findByRole('menuitem', { name: 'No blueprint options' })
    ).toBeInTheDocument();
  });

  it("keeps a row's own still-loading catalog on checking, whatever the page knows", async () => {
    render(
      <MemoryRouter>
        <FakeItemActions actions={fakeItemActions({ blueprints: catalog })}>
          <ItemContextMenu typeId={RIFTER} itemName="Rifter" blueprintTypeID={undefined}>
            <button type="button">Rifter</button>
          </ItemContextMenu>
        </FakeItemActions>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Build Plan (checking…)' })
    ).toBeInTheDocument();
  });

  it('adds to the Quickbar and shows info through the page', async () => {
    const actions = fakeItemActions();
    renderWith(actions);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add to Quickbar' }));
    expect(actions.addToQuickbar).toHaveBeenCalledWith(RIFTER, 'Rifter');

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Rifter' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Show info' }));
    expect(actions.showInfo).toHaveBeenCalledWith(RIFTER, 'Rifter');
  });
});
