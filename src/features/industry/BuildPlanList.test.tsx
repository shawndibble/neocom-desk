import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { BuildPlanList } from './BuildPlanList';

function plan(overrides: Partial<BuildPlanRecord> & { id: string; name: string }): BuildPlanRecord {
  return {
    characterId: 1,
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

const RIFTER_ENTRY: BlueprintCatalogEntry = {
  blueprintTypeID: 638,
  blueprint: { name: 'Rifter Blueprint', time: 1200, materials: [], products: [], skills: [] },
  productTypeID: 587,
  productName: 'Rifter',
  productNameLower: 'rifter',
};

const CATALOG: BlueprintCatalog = {
  entries: [RIFTER_ENTRY],
  byBlueprintTypeID: new Map([[RIFTER_ENTRY.blueprintTypeID, RIFTER_ENTRY]]),
  byProductTypeID: new Map<number, BlueprintCatalogEntry>([
    [RIFTER_ENTRY.productTypeID!, RIFTER_ENTRY],
  ]),
  typesById: {},
};

const EMPTY_CATALOG: BlueprintCatalog = {
  entries: [],
  byBlueprintTypeID: new Map(),
  byProductTypeID: new Map(),
  typesById: {},
};

const NOOP_COMPARE_PROPS = {
  compareMode: false,
  compareSelectedIds: new Set<string>(),
  onToggleCompareMode: () => {},
  onToggleCompareSelected: () => {},
  onOpenCompare: () => {},
};

describe('BuildPlanList', () => {
  const PLANS = [
    plan({ id: 'a', name: 'Merlin run', updatedAt: 300 }),
    plan({ id: 'b', name: 'Astero', updatedAt: 100 }),
  ];

  function renderList(onCreate = () => {}) {
    return render(
      <BuildPlanList
        plans={PLANS}
        catalog={CATALOG}
        selectedId={null}
        onSelect={() => {}}
        onCreate={onCreate}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        {...NOOP_COMPARE_PROPS}
      />
    );
  }

  it('always shows the blueprint picker, with no separate "new plan" button', () => {
    renderList();
    expect(screen.getByRole('searchbox', { name: 'Add build plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New plan' })).not.toBeInTheDocument();
  });

  it('creates a plan directly from the always-visible search', async () => {
    const onCreate = vi.fn();
    renderList(onCreate);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Add build plan' }), 'Rift');
    await userEvent.click(await screen.findByRole('button', { name: /Rifter/ }));

    expect(onCreate).toHaveBeenCalledWith(RIFTER_ENTRY);
  });

  it('lists every plan with no search or sort controls', () => {
    renderList();
    expect(screen.getByText('Merlin run')).toBeInTheDocument();
    expect(screen.getByText('Astero')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('BuildPlanList: compare mode (#453)', () => {
  const PLANS = [
    plan({ id: 'a', name: 'Rifter' }),
    plan({ id: 'b', name: 'Astero' }),
    plan({ id: 'c', name: 'Rokh' }),
  ];

  it('shows no checkboxes and a "Compare" toggle when compare mode is off', () => {
    render(
      <BuildPlanList
        plans={PLANS}
        catalog={EMPTY_CATALOG}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        {...NOOP_COMPARE_PROPS}
      />
    );
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument();
  });

  it('shows a per-row checkbox and a disabled "Compare (N)" button below 2 selections', async () => {
    const onToggleCompareSelected = vi.fn();
    render(
      <BuildPlanList
        plans={PLANS}
        catalog={EMPTY_CATALOG}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        {...NOOP_COMPARE_PROPS}
        compareMode={true}
        compareSelectedIds={new Set(['a'])}
        onToggleCompareSelected={onToggleCompareSelected}
      />
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Select Rifter to compare' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Astero to compare' })).not.toBeChecked();

    const compareButton = screen.getByRole('button', { name: 'Compare (1)' });
    expect(compareButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Astero to compare' }));
    expect(onToggleCompareSelected).toHaveBeenCalledWith('b');
  });

  it('enables "Compare (N)" and invokes onOpenCompare once 2+ plans are checked', async () => {
    const onOpenCompare = vi.fn();
    render(
      <BuildPlanList
        plans={PLANS}
        catalog={EMPTY_CATALOG}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onRename={() => {}}
        {...NOOP_COMPARE_PROPS}
        compareMode={true}
        compareSelectedIds={new Set(['a', 'b'])}
        onOpenCompare={onOpenCompare}
      />
    );

    const compareButton = screen.getByRole('button', { name: 'Compare (2)' });
    expect(compareButton).toBeEnabled();
    await userEvent.click(compareButton);
    expect(onOpenCompare).toHaveBeenCalled();
  });
});
