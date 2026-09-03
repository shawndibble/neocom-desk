import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
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

function renderEditor(
  onUpdate = vi.fn(),
  overrides: Partial<ComponentProps<typeof PlanEditor>> = {}
) {
  render(
    <PlanEditor
      characterId={1}
      plan={PLAN}
      catalog={CATALOG}
      trainedSkills={NO_TRAINED}
      attributes={ATTRIBUTES}
      implants={IMPLANTS}
      remapInfo={null}
      listPane={<div data-testid="plan-list-pane" />}
      onUpdate={onUpdate}
      {...overrides}
    />
  );
  return { onUpdate };
}

/**
 * jsdom's default `window.matchMedia` (vitest.setup.ts) never matches, so
 * every test here runs below `lg` unless it opts in — which is where the
 * tools pane is a collapsed disclosure.
 */
async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /plan tools/i }));
}

/** The tools-pane section a heading titles. */
function sectionFor(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).parentElement;
  if (!section) throw new Error(`expected a section for "${title}"`);
  return section;
}

/** Runs `body` with `matchMedia` reporting a `lg`+ viewport, then restores it. */
function withDesktopViewport(body: () => void) {
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
    body();
  } finally {
    window.matchMedia = realMatchMedia;
  }
}
describe('PlanEditor tools pane', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn<ClipboardWriter>>;

  beforeEach(() => {
    clipboardWriteText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
    configureClipboard(clipboardWriteText);
  });

  afterEach(() => {
    configureClipboard(null);
  });

  it('gathers every plan-level control into one tools pane of labelled sections', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const actions = sectionFor('Actions');
    const training = sectionFor('Training');
    const importExport = sectionFor('Import / Export');

    // Actions: the ones used while working the list.
    for (const name of [
      'Optimize remaps',
      'Add remap marker',
      'Optimize at my markers',
      'Suggest reorder',
    ]) {
      expect(within(actions).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(actions).getByLabelText('Remaps available')).toBeInTheDocument();

    // Training: the what-if lens, which changes the numbers rather than the plan.
    expect(within(training).getByLabelText('What-if implants')).toBeInTheDocument();
    expect(within(training).getByLabelText('Booster')).toBeInTheDocument();

    // Import/Export: plan-level file operations, still their own section.
    for (const name of ['Import from skill queue', 'Import from clipboard', 'Export']) {
      expect(within(importExport).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(within(importExport).queryByRole('button', { name: 'Suggest reorder' })).toBeNull();
    expect(within(actions).queryByRole('button', { name: 'Import from skill queue' })).toBeNull();
  });

  it('renders each action as one full-width labelled row, not an icon-only control', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

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
      // The visible label *is* the accessible name — no aria-label standing in
      // for a glyph, as the icon-only mobile strip (#224) used to need.
      expect(button).not.toHaveAttribute('aria-label');
      expect(button.textContent).toBe(name);
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('justify-start');
    }
  });

  it('keeps the entry list out of the tools pane, so the plan itself stays the main column', () => {
    renderEditor();

    // Collapsed on a narrow viewport, the tools cost a single row and the
    // entry list is still rendered and reachable without expanding anything.
    expect(screen.getByRole('button', { name: /plan tools/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('heading', { name: 'Your entries' })).toBeInTheDocument();
    expect(screen.getByText('Skill A I')).toBeInTheDocument();
  });

  it('collapses Export into one control that reveals "to clipboard" / "to CSV" only after being opened', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    expect(screen.queryByRole('menuitem', { name: 'Export to clipboard' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Export CSV' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('menuitem', { name: 'Export to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export CSV' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
  });

  it("opens Suggest reorder's preview in a Modal; Accept applies the reorder and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

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
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Suggest reorder' }));
    const dialog = screen.getByRole('dialog', { name: 'Suggested reorder' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Optimize remaps results inline, beneath the button that produced them', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    // The verdict lands in the same Actions section as its trigger, rather
    // than in another panel at the bottom of the page.
    const actions = sectionFor('Actions');
    expect(within(actions).getByRole('status')).toBeInTheDocument();
  });
});

describe('PlanEditor tools pane placement', () => {
  it('folds the tools into one collapsed disclosure below `lg`, so the plan leads the page', () => {
    renderEditor();

    const toggle = screen.getByRole('button', { name: /plan tools/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Nothing inside is mounted while collapsed — the whole tool set costs
    // one row, where it used to cost three panels.
    expect(screen.queryByRole('button', { name: 'Optimize remaps' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import from skill queue' })).toBeNull();
    expect(screen.queryByLabelText('What-if implants')).toBeNull();
  });

  it('puts the tools in the sidebar under the plan list at `lg`+, always open', () => {
    withDesktopViewport(() => {
      renderEditor();

      // No disclosure toggle at all: the sidebar has the room, so the tools
      // are simply there.
      expect(screen.queryByRole('button', { name: /^plan tools$/i })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Plan tools' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Optimize remaps' })).toBeInTheDocument();

      const sidebar = screen.getByTestId('plan-list-pane').closest('aside');
      if (!sidebar) throw new Error('expected the tools to share the sidebar with the plan list');
      expect(within(sidebar).getByRole('heading', { name: 'Plan tools' })).toBeInTheDocument();
    });
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

describe('PlanEditor what-if implants', () => {
  // A clone wearing an unmatched set — the case a uniform "+N" cannot say.
  const FITTED: Implants = { perception: 4, memory: 3 };

  function renderWithImplants() {
    renderEditor(vi.fn(), { implants: FITTED });
  }

  /** The five per-slot inputs, in INT/MEM/PER/WIL/CHA order. */
  function bonusInputs(): string[] {
    return ['Intelligence', 'Memory', 'Perception', 'Willpower', 'Charisma'].map(
      (attribute) => screen.getByLabelText<HTMLInputElement>(`${attribute} implant bonus`).value
    );
  }

  it("opens on the clone's own per-slot implants, unmatched set and all", async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    expect(screen.getByLabelText<HTMLSelectElement>('What-if implants').value).toBe('current');
    expect(bonusInputs()).toEqual(['0', '3', '4', '0', '0']);
  });

  it('suppresses the platform spinner, which would break the row on hover', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    // Measured: five fields across a 294px sidebar leaves a 29.6px content
    // box each, and Chrome's hover/focus spin buttons take about half of it
    // and shove the digit left — so the hovered cell falls out of alignment
    // with the other four. jsdom has no layout, so the class is the only
    // thing a unit test can hold on to; the rule and the reasoning are in
    // src/styles/index.css.
    for (const attribute of ['Intelligence', 'Memory', 'Perception', 'Willpower', 'Charisma']) {
      expect(screen.getByLabelText(`${attribute} implant bonus`)).toHaveClass('field-no-spinner');
    }
    // The pane's other two number fields are the same field at the same
    // size, so they behave the same way on hover.
    expect(screen.getByLabelText('Remaps available')).toHaveClass('field-no-spinner');
  });

  it('a preset fills all five in one click', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    await user.selectOptions(screen.getByLabelText('What-if implants'), '+4');

    expect(bonusInputs()).toEqual(['4', '4', '4', '4', '4']);
    // "Custom" is not offered while a preset is in force — you become custom
    // by editing a value, not by picking it.
    expect(screen.queryByRole('option', { name: 'Custom' })).toBeNull();
  });

  it('editing one slot leaves the other four alone and stops claiming the preset', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    await user.selectOptions(screen.getByLabelText('What-if implants'), '+4');
    const perception = screen.getByLabelText('Perception implant bonus');
    await user.clear(perception);
    await user.type(perception, '5');

    expect(bonusInputs()).toEqual(['4', '4', '5', '4', '4']);
    expect(screen.getByLabelText<HTMLSelectElement>('What-if implants').value).toBe('custom');
  });

  it('clamps a slot to the documented +0..+5 range', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    const memory = screen.getByLabelText('Memory implant bonus');
    await user.clear(memory);
    await user.type(memory, '9');

    expect(screen.getByLabelText<HTMLInputElement>('Memory implant bonus').value).toBe('5');
  });

  it('"Current" is still one click back to the real fitted set after experimenting', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    await user.selectOptions(screen.getByLabelText('What-if implants'), '+5');
    const charisma = screen.getByLabelText('Charisma implant bonus');
    await user.clear(charisma);
    await user.type(charisma, '1');
    expect(screen.getByLabelText<HTMLSelectElement>('What-if implants').value).toBe('custom');

    await user.selectOptions(screen.getByLabelText('What-if implants'), 'current');

    expect(bonusInputs()).toEqual(['0', '3', '4', '0', '0']);
  });
});
