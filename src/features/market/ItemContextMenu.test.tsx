import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { PiData } from '@/sde/types';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => pi),
}));

const { ItemContextMenu } = await import('./ItemContextMenu');

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

  it('offers "Add material components" for a material not yet being built, and invokes it on select', async () => {
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
          buildingHere={false}
        >
          <button type="button">Tritanium</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    const item = await screen.findByRole('menuitem', { name: 'Add material components' });
    fireEvent.click(item);

    expect(onToggleBuildHere).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Buy instead' })).not.toBeInTheDocument();
  });

  it('offers "Buy instead" once the material is being built', async () => {
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
          buildingHere
        >
          <button type="button">Tritanium</button>
        </ItemContextMenu>
      </MemoryRouter>
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tritanium' }));

    const item = await screen.findByRole('menuitem', { name: 'Buy instead' });
    fireEvent.click(item);

    expect(onToggleBuildHere).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('menuitem', { name: 'Add material components' })
    ).not.toBeInTheDocument();
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
      `/planetary-industry?tab=plan&type=${BROADCAST_NODE}`
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
