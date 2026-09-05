import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog } from './blueprintCatalog';
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

describe('BuildPlanList: search and sort UI (#409)', () => {
  const PLANS = [
    plan({ id: 'a', name: 'Rifter', updatedAt: 300 }),
    plan({ id: 'b', name: 'Astero', updatedAt: 100 }),
  ];

  function renderList() {
    return render(
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
  }

  it('filters the rendered list as the search box is typed into', async () => {
    renderList();
    expect(screen.getByText('Rifter')).toBeInTheDocument();
    expect(screen.getByText('Astero')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'rift');

    expect(screen.getByText('Rifter')).toBeInTheDocument();
    expect(screen.queryByText('Astero')).not.toBeInTheDocument();
  });

  it('shows a no-results state when the search matches nothing', async () => {
    renderList();
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No build plans match this search')).toBeInTheDocument();
  });

  it('re-sorts the rendered list by last updated', async () => {
    const { container } = renderList();
    // Default (alphabetical): Astero before Rifter.
    let names = [...container.querySelectorAll('li > button:first-of-type')].map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Astero', 'Rifter']);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'lastUpdated');

    names = [...container.querySelectorAll('li > button:first-of-type')].map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Rifter', 'Astero']); // Rifter (updatedAt 300) is most recently updated.
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
