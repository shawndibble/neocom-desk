import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
  blueprint: {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [],
    skills: [],
    activity: 'manufacturing',
  },
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

/** Build Groups (issue #626), inert — the tests below are about plans. */
const NOOP_GROUP_PROPS = {
  groups: [],
  expandedGroupIds: new Set<string>(),
  selectedGroupId: null,
  onToggleGroup: () => {},
  onSelectGroup: () => {},
  onCreateGroup: () => {},
  onRenameGroup: () => {},
  onDeleteGroup: () => {},
  onMovePlan: () => {},
  onOpenFitImport: () => {},
  statsByPlanId: new Map(),
  statsByGroupId: new Map(),
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
        {...NOOP_GROUP_PROPS}
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
        {...NOOP_GROUP_PROPS}
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
        {...NOOP_GROUP_PROPS}
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
        {...NOOP_GROUP_PROPS}
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

describe('BuildPlanList: build groups (#626)', () => {
  const GROUPS = [{ id: 'g1', name: "Loru's Max Hacker — Buzzard", order: 0 }];
  const PLANS = [
    plan({ id: 'a', name: 'Buzzard', buildGroupId: 'g1' }),
    plan({ id: 'b', name: 'Data Analyzer II', buildGroupId: 'g1' }),
    plan({ id: 'c', name: 'Rokh' }),
  ];

  function renderGrouped(overrides: Record<string, unknown> = {}) {
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
        {...NOOP_GROUP_PROPS}
        groups={GROUPS}
        {...overrides}
      />
    );
  }

  it('collapses a group by default, hiding its members', () => {
    renderGrouped();
    expect(screen.getByText("Loru's Max Hacker — Buzzard")).toBeInTheDocument();
    expect(screen.queryByText('Data Analyzer II')).not.toBeInTheDocument();
  });

  it('names the ship from the stored group name, not from whichever member sorts first', () => {
    // Nothing marks which plan is the hull, and every ordering that could
    // stand in for one (insertion order, newest updatedAt) names a different
    // plan the moment a member is edited. So Fit Import puts the ship in the
    // name and the list never derives it.
    renderGrouped();
    expect(
      screen.getByRole('button', { name: "Delete group Loru's Max Hacker — Buzzard" })
    ).toBeInTheDocument();
  });

  it('shows the members once expanded', () => {
    renderGrouped({ expandedGroupIds: new Set(['g1']) });
    expect(screen.getByText('Data Analyzer II')).toBeInTheDocument();
  });

  it('always lists a plan that is in no group', () => {
    renderGrouped();
    expect(screen.getByText('Rokh')).toBeInTheDocument();
  });

  it('lists a plan whose group is gone as an ordinary ungrouped plan', () => {
    // A group deleted here, or a sync race delivering the plan before the
    // settings blob — either way the plan must not vanish from the list.
    renderGrouped({ groups: [] });
    expect(screen.getByText('Buzzard')).toBeInTheDocument();
    expect(screen.getByText('Data Analyzer II')).toBeInTheDocument();
  });

  it('toggles a group from its caret', async () => {
    const onToggleGroup = vi.fn();
    renderGrouped({ onToggleGroup });
    await userEvent.click(screen.getByRole('button', { name: /Show or hide the plans in/ }));
    expect(onToggleGroup).toHaveBeenCalledWith('g1');
  });

  it('selects every member of a collapsed group at once in compare mode', async () => {
    // A row checkbox only renders on a visible row, so without this a
    // collapsed group's plans cannot be compared at all.
    const onToggleCompareSelected = vi.fn();
    renderGrouped({ compareMode: true, onToggleCompareSelected });
    await userEvent.click(screen.getByRole('checkbox', { name: /Select every plan in/ }));
    expect(onToggleCompareSelected).toHaveBeenCalledWith('a');
    expect(onToggleCompareSelected).toHaveBeenCalledWith('b');
    expect(onToggleCompareSelected).not.toHaveBeenCalledWith('c');
  });

  it('leaves an already-fully-selected group alone when unticked', async () => {
    const onToggleCompareSelected = vi.fn();
    renderGrouped({
      compareMode: true,
      compareSelectedIds: new Set(['a']),
      onToggleCompareSelected,
    });
    // Partly selected, so the header ticks the rest rather than clearing.
    await userEvent.click(screen.getByRole('checkbox', { name: /Select every plan in/ }));
    expect(onToggleCompareSelected).toHaveBeenCalledWith('b');
    expect(onToggleCompareSelected).not.toHaveBeenCalledWith('a');
  });

  it('renames a group from its context menu, with no separate visible rename button', async () => {
    // A second always-visible icon here shifted the Est./Verdict/Runs
    // columns over for every group header — rename lives in the context
    // menu now, same as a plan row's own name button.
    renderGrouped();
    expect(screen.queryByRole('button', { name: /^Rename group/ })).not.toBeInTheDocument();

    const nameButton = screen.getByRole('button', { name: "Loru's Max Hacker — Buzzard" });
    fireEvent.contextMenu(nameButton);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    expect(screen.getByRole('textbox', { name: 'Rename group' })).toBeInTheDocument();
  });
});

// What a drop *means* lives in `groupDrop.test.ts` — pure, and every branch of
// it. Simulating a real dnd-kit drag here would be measuring jsdom's zero-sized
// rects against a 4px activation distance, which tests the harness rather than
// the list. So these cover the rendered contract only: the handle is there, and
// it is deliberately not the accessibility path.
describe('BuildPlanList: dragging a plan into a group (#627)', () => {
  const HANDLE_TITLE = 'Drag onto a group to move this plan into it';
  const GROUPS = [{ id: 'g1', name: 'Buzzard fit', order: 0 }];
  const PLANS = [
    plan({ id: 'a', name: 'Buzzard', buildGroupId: 'g1' }),
    plan({ id: 'c', name: 'Rokh' }),
  ];

  function renderDraggable(overrides: Record<string, unknown> = {}) {
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
        {...NOOP_GROUP_PROPS}
        groups={GROUPS}
        expandedGroupIds={new Set(['g1'])}
        {...overrides}
      />
    );
  }

  it('gives every plan row a drag handle', () => {
    renderDraggable();
    expect(screen.getAllByTitle(HANDLE_TITLE)).toHaveLength(2);
  });

  it('offers no handle at all until there is a group to drag into', () => {
    // With no groups every drop resolves to the plan's own (absent) group, so
    // a grab cursor would be advertising a move that cannot happen.
    renderDraggable({ groups: [] });
    expect(screen.queryByTitle(HANDLE_TITLE)).not.toBeInTheDocument();
  });

  it('keeps the handle out of the tab order and hidden from assistive tech', () => {
    // Keyboard dragging would step a flat 25px per arrow press and announce
    // raw droppable ids; the per-row menu reaches the same destinations
    // properly, so the handle is pointer-only on purpose.
    renderDraggable();
    for (const handle of screen.getAllByTitle(HANDLE_TITLE)) {
      expect(handle).toHaveAttribute('aria-hidden', 'true');
      expect(handle).toHaveAttribute('tabindex', '-1');
      // Without this a touch-drag scrolls the list instead of dragging (#408).
      expect(handle).toHaveClass('touch-none');
    }
  });

  it('keeps only Delete visible per row, moving move-to-group into the row context menu', () => {
    renderDraggable();
    expect(screen.queryByRole('button', { name: /Move to group/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Rokh' })).toBeInTheDocument();
  });

  it('opens "Move to group" from the row context menu, reachable via focus + the native menu key', () => {
    // The row's name button is a real tab stop, so Shift+F10 / the Menu key —
    // which the browser turns into a `contextmenu` event on whatever has
    // focus — reaches it without a mouse. Tests fake that translation the
    // same way `ContextMenu.test.tsx` does: focus, then `fireEvent.contextMenu`.
    renderDraggable();
    const target = screen.getByText('Rokh');
    target.focus();
    fireEvent.contextMenu(target);
    expect(screen.getByRole('menuitem', { name: 'Move to group' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('renders no drag overlay while nothing is being dragged', () => {
    // The overlay repeats the dragged plan's name, so an always-mounted one
    // would put a second copy of that text in the document.
    renderDraggable();
    expect(screen.getAllByText('Rokh')).toHaveLength(1);
  });

  it('leaves a collapsed group its header row, the only thing a drop can land on', () => {
    renderDraggable({ expandedGroupIds: new Set<string>() });
    expect(screen.getByText('Buzzard fit')).toBeInTheDocument();
    expect(screen.queryByText('Buzzard')).not.toBeInTheDocument();
  });
});
