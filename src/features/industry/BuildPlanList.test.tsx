import { describe, it, expect } from 'vitest';
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
