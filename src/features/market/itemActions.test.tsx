import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadBlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { useItemActions } from './itemActions';
import { ItemActionsProvider } from './ItemActionsProvider';
import { usePageItemActions, type PageItemActionsOptions } from './usePageItemActions';

vi.mock('@/features/industry/blueprintCatalog', () => ({
  loadBlueprintCatalog: vi.fn(),
}));

// The real modal reads ESI; what's under test here is that a page has one.
vi.mock('./ItemDetailModal', () => ({
  ItemDetailModal: ({ itemName, onClose }: { itemName: string; onClose: () => void }) => (
    <div role="dialog" aria-label={itemName}>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

const TRITANIUM = 34;
const RIFTER = 587;
const RIFTER_BLUEPRINT = 691;

const catalog = {
  byProductTypeID: new Map([[RIFTER, { blueprintTypeID: RIFTER_BLUEPRINT }]]),
} as unknown as BlueprintCatalog;

function Consumer() {
  const actions = useItemActions();
  return (
    <div>
      <p>quickbar {actions.canAddToQuickbar ? 'on' : 'off'}</p>
      <p>rifter blueprint {String(actions.blueprintFor(RIFTER))}</p>
      <p>tritanium blueprint {String(actions.blueprintFor(TRITANIUM))}</p>
      <button type="button" onClick={() => actions.addToQuickbar(TRITANIUM, 'Tritanium')}>
        add
      </button>
      <button type="button" onClick={actions.requestBlueprints}>
        request
      </button>
      <button type="button" onClick={() => actions.showInfo(TRITANIUM, 'Tritanium')}>
        info tritanium
      </button>
      <button type="button" onClick={() => actions.showInfo(RIFTER, 'Rifter')}>
        info rifter
      </button>
    </div>
  );
}

function Page(options: PageItemActionsOptions) {
  const page = usePageItemActions(options);
  return (
    <ItemActionsProvider page={page}>
      <Consumer />
    </ItemActionsProvider>
  );
}

beforeEach(async () => {
  await db.quickbars.clear();
  vi.mocked(loadBlueprintCatalog).mockReset();
});

describe('Item Actions — Quickbar', () => {
  it('cannot add to the Quickbar with no active character', () => {
    render(<Page activeCharacterId={null} />);
    expect(screen.getByText('quickbar off')).toBeInTheDocument();
  });

  it("adds an item to the active character's Quickbar", async () => {
    render(<Page activeCharacterId={90000001} />);
    expect(screen.getByText('quickbar on')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'add' }));

    await waitFor(async () => {
      const record = await db.quickbars.get('90000001');
      expect(record?.items.map((item) => item.typeId)).toEqual([TRITANIUM]);
    });
  });
});

describe('Item Actions — blueprint catalog', () => {
  it('is still checking until the catalog is first requested, then loads it once', async () => {
    vi.mocked(loadBlueprintCatalog).mockResolvedValue(catalog);
    render(<Page activeCharacterId={null} lazyBlueprints />);
    expect(screen.getByText('rifter blueprint undefined')).toBeInTheDocument();
    expect(loadBlueprintCatalog).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'request' }));
    await userEvent.click(screen.getByRole('button', { name: 'request' }));

    expect(await screen.findByText(`rifter blueprint ${RIFTER_BLUEPRINT}`)).toBeInTheDocument();
    expect(screen.getByText('tritanium blueprint null')).toBeInTheDocument();
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(1);
  });

  it('never loads a catalog on a page without one — every item has no blueprint options', async () => {
    render(<Page activeCharacterId={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'request' }));

    expect(screen.getByText('rifter blueprint null')).toBeInTheDocument();
    expect(loadBlueprintCatalog).not.toHaveBeenCalled();
  });
});

describe('Item Actions — Show info', () => {
  it('opens one Item Detail modal, for the latest item asked about', async () => {
    render(<Page activeCharacterId={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'info tritanium' }));
    await userEvent.click(screen.getByRole('button', { name: 'info rifter' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Rifter' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
