import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { buildUnlockIndex } from '@/engine/skillUnlocks';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import type { SkillCatalog } from '../skillMap';
import { PlanEditor } from './PlanEditor';

function skill(overrides: Partial<SkillType> & Pick<SkillType, 'typeID' | 'name'>): SkillType {
  return {
    description: '',
    groupID: 1,
    groupName: 'Test Group',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
    ...overrides,
  };
}

// Two independent, single-level skills in different attribute pairs so
// suggestReorder (which groups by priority then attribute pair) actually
// changes the order: the 'high' priority Skill B group sorts before the
// 'normal' priority Skill A group.
const SKILLS: SkillType[] = [
  skill({ typeID: 10, name: 'Skill A', primaryAttr: 'intelligence', secondaryAttr: 'memory' }),
  skill({ typeID: 20, name: 'Skill B', primaryAttr: 'perception', secondaryAttr: 'willpower' }),
];

const CATALOG: SkillCatalog = (() => {
  const engineSkills = new Map(
    SKILLS.map((s) => [
      s.typeID,
      {
        typeID: s.typeID,
        name: s.name,
        rank: s.rank,
        primary: s.primaryAttr,
        secondary: s.secondaryAttr,
        prereqs: s.prereqs.map((p) => ({ typeID: p.skillTypeID, level: p.level })),
      },
    ])
  );
  return {
    engineSkills,
    bySkillTypeID: new Map(SKILLS.map((s) => [s.typeID, s])),
    unlocksByTypeID: buildUnlockIndex(engineSkills),
  };
})();

const NO_TRAINED: ReadonlyMap<number, TrainedSkill> = new Map();
const ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 20,
};
const IMPLANTS: Implants = {};

const PLAN: SkillPlanRecord = {
  id: 'plan-1',
  characterId: 1,
  name: 'Test plan',
  entries: [
    { skillTypeID: 10, targetLevel: 1 },
    { skillTypeID: 20, targetLevel: 1, priority: 'high' },
  ],
  remapCount: 1,
  markers: [],
  updatedAt: 0,
};

function renderEditor(onUpdate = vi.fn()) {
  render(
    <PlanEditor
      characterId={1}
      plan={PLAN}
      catalog={CATALOG}
      trainedSkills={NO_TRAINED}
      attributes={ATTRIBUTES}
      implants={IMPLANTS}
      remapInfo={null}
      onUpdate={onUpdate}
    />
  );
  return { onUpdate };
}

describe('PlanEditor toolbar reorganization', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn<ClipboardWriter>>;

  beforeEach(() => {
    clipboardWriteText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(clipboardWriteText);
  });

  afterEach(() => {
    configureClipboard(null);
  });

  it('puts Import/Export in their own area, separate from the pinned reorder/optimize/marker toolbar', () => {
    renderEditor();

    const importExportSection = screen
      .getByRole('heading', { name: 'Import / Export' })
      .closest('section');
    const toolbarSection = screen.getByRole('heading', { name: 'Toolbar' }).closest('section');
    if (!importExportSection || !toolbarSection) throw new Error('expected both panels');

    expect(
      within(importExportSection).getByRole('button', { name: 'Import from skill queue' })
    ).toBeInTheDocument();
    expect(
      within(importExportSection).getByRole('button', { name: 'Import from clipboard' })
    ).toBeInTheDocument();
    expect(within(importExportSection).getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(
      within(importExportSection).queryByRole('button', { name: 'Suggest reorder' })
    ).toBeNull();

    expect(
      within(toolbarSection).getByRole('button', { name: 'Optimize remaps' })
    ).toBeInTheDocument();
    expect(
      within(toolbarSection).getByRole('button', { name: 'Add remap marker' })
    ).toBeInTheDocument();
    expect(
      within(toolbarSection).getByRole('button', { name: 'Optimize at my markers' })
    ).toBeInTheDocument();
    expect(
      within(toolbarSection).getByRole('button', { name: 'Suggest reorder' })
    ).toBeInTheDocument();
    expect(
      within(toolbarSection).queryByRole('button', { name: 'Import from skill queue' })
    ).toBeNull();

    // Pinned near the top of the entries list, not scrolling away with it,
    // stacked below the also-pinned summary strip at a distinct offset so
    // neither hides the other.
    const summarySection = screen.getByRole('heading', { name: 'Plan summary' }).closest('section');
    if (!summarySection) throw new Error('expected summary section');

    expect(summarySection).toHaveClass('lg:sticky', 'lg:top-0');
    // Distinct, non-zero offset so the toolbar stacks below the summary
    // strip instead of both claiming `top-0` and overlapping.
    expect(toolbarSection).toHaveClass('lg:sticky', 'lg:top-[4.625rem]');
    expect(toolbarSection.className).not.toMatch(/\blg:top-0\b/);
  });

  it('collapses Export into one control that reveals "to clipboard" / "to CSV" only after being opened', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByRole('menuitem', { name: 'Export to clipboard' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Export CSV' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export to clipboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('menuitem', { name: 'Export to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export CSV' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
  });

  it("opens Suggest reorder's preview in a Modal; Accept applies the reorder and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Suggest reorder' }));

    const dialog = screen.getByRole('dialog', { name: 'Suggested reorder' });
    expect(within(dialog).getByText('Skill B I')).toBeInTheDocument();
    expect(within(dialog).getByText('Skill A I')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledWith({
      entries: [
        { skillTypeID: 20, targetLevel: 1, priority: 'high' },
        { skillTypeID: 10, targetLevel: 1 },
      ],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Suggest reorder Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Suggest reorder' }));
    const dialog = screen.getByRole('dialog', { name: 'Suggested reorder' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Optimize remaps results inline (no dialog)', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Optimize remaps' })).toBeInTheDocument();
  });
});

describe('PlanEditor icon-only toolbar below desktop width (#224)', () => {
  // jsdom's default `window.matchMedia` (vitest.setup.ts) never matches, so
  // this already runs at a narrow (below-`lg`) viewport with no mock needed.
  it('renders the toolbar actions as icon-only buttons, same accessible names as the text buttons, in a scrollable row', () => {
    renderEditor();

    const importExportSection = screen
      .getByRole('heading', { name: 'Import / Export' })
      .closest('section')!;
    const toolbarSection = screen.getByRole('heading', { name: 'Toolbar' }).closest('section')!;

    const actionNames = [
      'Import from skill queue',
      'Import from clipboard',
      'Export',
      'Optimize remaps',
      'Add remap marker',
      'Optimize at my markers',
      'Suggest reorder',
    ];
    for (const name of actionNames) {
      const button = screen.getByRole('button', { name });
      // Icon-only: the accessible name comes from `aria-label`, not visible
      // text — the glyph is the only rendered child, hidden from assistive
      // tech (IconButton.test.tsx covers that contract directly).
      expect(button).toHaveAttribute('aria-label', name);
      expect(button.textContent).toBe('');
    }

    // `.closest` rather than `.parentElement`: every action here is wrapped
    // in IconButton's own Tooltip span, one extra level between the button
    // and the row div.
    const importExportRow = screen
      .getByRole('button', { name: 'Import from skill queue' })
      .closest('div.flex.items-center.gap-2')!;
    expect(importExportRow).toHaveClass('overflow-x-auto');
    expect(importExportRow).not.toHaveClass('flex-wrap');
    expect(within(importExportSection).getAllByRole('button')).toHaveLength(3);

    const toolbarRow = screen
      .getByRole('button', { name: 'Add remap marker' })
      .closest('div.flex.items-center.gap-2')!;
    expect(toolbarRow).toHaveClass('overflow-x-auto');
    expect(toolbarRow).not.toHaveClass('flex-wrap');
    // The 4 toolbar actions, plus the remap-count row's own "?" InfoTooltip
    // button (unrelated to this ticket — not an action, not converted).
    expect(within(toolbarSection).getAllByRole('button')).toHaveLength(5);
  });

  it('keeps full-text buttons at `lg`+, unchanged', () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (media: string) =>
      ({
        media,
        matches: true,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    try {
      renderEditor();

      const importExportRow = screen
        .getByRole('button', { name: 'Import from skill queue' })
        .closest('div.flex.items-center.gap-2')!;
      expect(importExportRow).toHaveClass('flex-wrap');
      expect(importExportRow).not.toHaveClass('overflow-x-auto');

      for (const name of [
        'Import from skill queue',
        'Import from clipboard',
        'Export',
        'Optimize remaps',
        'Add remap marker',
        'Optimize at my markers',
        'Suggest reorder',
      ]) {
        const button = screen.getByRole('button', { name });
        expect(button).not.toHaveAttribute('aria-label');
        expect(button.textContent).toBe(name);
      }
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
});

describe('PlanEditor grouping toggle (#115)', () => {
  it('defaults to Priority band headers', () => {
    renderEditor();

    expect(screen.getByText('High priority')).toBeInTheDocument();
  });

  it('switching to Attribute pair regroups the entry list without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.selectOptions(screen.getByLabelText('Group by'), 'Attribute pair');

    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
    expect(screen.getByText('PER/WIL attributes')).toBeInTheDocument();
    expect(screen.getByText('INT/MEM attributes')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
