import { useState, type ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import type { CachedResult } from '@/features/skills/data';
import type { CharacterAttributes } from '@/esi/endpoints';
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

// ESI's own reading, distinct from ATTRIBUTES above (the scheduler's base
// sheet) so a test can tell which one the tools pane put on screen.
const ATTRIBUTES_RESULT: CachedResult<CharacterAttributes> = {
  data: { intelligence: 24, memory: 23, perception: 22, willpower: 25, charisma: 21 },
  fetchedAt: new Date('2025-01-01T00:00:00Z'),
  fromCache: false,
  truncated: false,
};

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

/**
 * `PlanEditor` is a controlled component: everything it persists — entries,
 * markers, the remap count, and the two lenses the plan is costed under
 * (What-If Implants, Booster) — lives on the `plan` prop, and an edit is a
 * patch the owner writes back. The route does that through Dexie, and the
 * updated record returns via `useLiveQuery`; this harness does the same
 * synchronously, so a control the user just moved reads back the way it does
 * in the app instead of snapping to a frozen prop.
 */
function renderEditor(
  onUpdate = vi.fn(),
  overrides: Partial<ComponentProps<typeof PlanEditor>> = {}
) {
  const { plan: initialPlan = PLAN, ...rest } = overrides;

  function Harness() {
    const [plan, setPlan] = useState(initialPlan);
    // Stands in for the route's PageHeader actions slot: PlanEditor portals
    // Import/Export into it, so a test needs a mounted node to portal into
    // (queries still find the portaled content — Testing Library's `screen`
    // queries `document.body`, not this component's own subtree).
    const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);
    return (
      <>
        <div ref={setHeaderActionsEl} />
        <PlanEditor
          characterId={1}
          plan={plan}
          catalog={CATALOG}
          trainedSkills={NO_TRAINED}
          attributes={ATTRIBUTES}
          implants={IMPLANTS}
          attributesResult={ATTRIBUTES_RESULT}
          remapInfo={null}
          listPane={<div data-testid="plan-list-pane" />}
          headerActionsContainer={headerActionsEl}
          {...rest}
          // After the spread, not before: the write-back is this harness's
          // whole point, and an `overrides.onUpdate` would otherwise turn it
          // off silently. Tests observe the patches through the `onUpdate` spy
          // this closes over instead.
          onUpdate={(patch) => {
            onUpdate(patch);
            setPlan((current) => ({ ...current, ...patch, updatedAt: current.updatedAt + 1 }));
          }}
        />
      </>
    );
  }

  render(
    <MemoryRouter>
      <Harness />
      <LocationProbe />
    </MemoryRouter>
  );
  return { onUpdate };
}

/** Exposes wherever `navigate()` lands, for the Market cross-link tests below. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname + location.search}</div>;
}

/** The five per-slot What-If inputs, in INT/MEM/PER/WIL/CHA order. */
function bonusInputValues(): string[] {
  return ['Intelligence', 'Memory', 'Perception', 'Willpower', 'Charisma'].map(
    (attribute) => screen.getByLabelText<HTMLInputElement>(`${attribute} implant bonus`).value
  );
}

/** A clone wearing an unmatched set — the case a uniform "+N" cannot say. */
const FITTED: Implants = { perception: 4, memory: 3 };

/**
 * jsdom's default `window.matchMedia` (vitest.setup.ts) never matches, so
 * every test here runs below `lg` unless it opts in — which is where the
 * tools pane is a collapsed disclosure.
 */
async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /plan tools/i }));
}

/**
 * The tools-pane section a heading titles. `closest('section')`, not
 * `parentElement`: a heading now shares a flex row with its section's
 * optional right-aligned actions (the Attributes section's `DataAgeBadge`).
 */
function sectionFor(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`expected a section for "${title}"`);
  return section as HTMLElement;
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

  it('gathers plan-level actions and attributes into one tools pane of labelled sections', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const actions = sectionFor('Actions');
    const attributesSection = sectionFor('Attributes');

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

    // Attributes: the sheet every estimate is costed against, then the two
    // what-if lenses over it — which change the numbers, not the plan.
    expect(within(attributesSection).getByText('Intelligence')).toBeInTheDocument();
    expect(within(attributesSection).getByLabelText('What-if implants')).toBeInTheDocument();
    expect(within(attributesSection).getByLabelText('Booster')).toBeInTheDocument();

    // Import/Export: plan-level file operations, now icon buttons portaled
    // into the route's page header rather than a tools-pane section.
    for (const name of ['Import from skill queue', 'Import from clipboard', 'Export']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
      expect(within(actions).queryByRole('button', { name })).toBeNull();
    }
  });

  it('renders each Actions-section control as one full-width labelled row, not an icon-only control', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    for (const name of [
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

  it('renders Import/Export as icon-only controls (portaled to the page header)', () => {
    renderEditor();

    for (const name of ['Import from skill queue', 'Import from clipboard', 'Export']) {
      const button = screen.getByRole('button', { name });
      // Icon-only: the accessible name comes from aria-label, not visible text.
      expect(button).toHaveAttribute('aria-label', name);
      expect(button.textContent).toBe('');
    }
  });

  it("doesn't render Import/Export when the caller has no header-actions slot to portal into", () => {
    renderEditor(vi.fn(), { headerActionsContainer: null });

    expect(screen.queryByRole('button', { name: 'Import from skill queue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import from clipboard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
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

  it("opens Optimize remaps' preview in a Modal when it finds savings; Accept applies the segments as markers and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    expect(within(dialog).getByText(/^Remapping saves/)).toBeInTheDocument();
    expect(within(dialog).getByText('Segment 1')).toBeInTheDocument();
    // The beside-the-button confirmation (#222) still fires alongside the
    // Modal, same as "Suggest reorder"'s toast + Modal pairing.
    expect(within(sectionFor('Actions')).getByRole('status')).toHaveTextContent(/^Saves/);

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    // Skill A (intelligence/memory) and Skill B (perception/willpower) are
    // different pairs, so a single remap is worth spending on the second —
    // the marker lands right before it, at entry-list position 1.
    expect(onUpdate).toHaveBeenCalledWith({ markers: [1], markerAttributes: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Optimize remaps Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));
    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the Optimize remaps Modal even with no savings, offering only Close', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, remapCount: 0 } });
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    expect(
      within(dialog).getByText(
        'This plan has 0 remaps to spend, so nothing was placed — raise "Remaps available" above and optimize again.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Accept' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the new marker\'s target attributes immediately, without a separate "Optimize at my markers" click', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));
    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    // remapInstruction's own format: five "XXX N" terms joined by " / ",
    // which only a marker row's attribute spread renders — asserting it
    // appeared here means the row already gave way to the spread instead of
    // sitting on the plain divider until a second, separate optimize click.
    const entriesPanel = screen.getByRole('heading', { name: 'Your entries' }).closest('section')!;
    expect(
      within(entriesPanel).getByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)
    ).toBeInTheDocument();
  });

  it("opens Optimize at my markers' preview in a Modal when it finds savings; Accept re-applies the segments as markers and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Optimize at my markers' }));

    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });
    expect(within(dialog).getByText(/^Remapping saves/)).toBeInTheDocument();
    expect(within(dialog).getByText('Segment 1')).toBeInTheDocument();
    // The beside-the-button confirmation (#222) still fires alongside the
    // Modal, same as "Suggest reorder"'s toast + Modal pairing.
    expect(within(sectionFor('Actions')).getByRole('status')).toHaveTextContent(/^Saves/);

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    // The plan's own marker (position 1) round-trips back through the same
    // segments-to-markers conversion "Optimize remaps" uses.
    expect(onUpdate).toHaveBeenCalledWith({ markers: [1], markerAttributes: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Optimize at my markers Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize at my markers' }));
    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the Optimize at my markers Modal even with no savings, offering only Close', async () => {
    const user = userEvent.setup();
    // A marker at the very end of the entry list delimits nothing to remap.
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, markers: [PLAN.entries.length] },
    });
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize at my markers' }));

    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });
    expect(
      within(dialog).getByText(
        'Every remap marker sits at the end of the plan, so nothing follows it to remap for — drag a marker in front of the skills it should speed up.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Accept' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows a marker's target attributes on first mount too, not only after an explicit optimize click", () => {
    // A plan reopened fresh (a reload, or the plan synced onto another
    // device) has no in-memory "Optimize at my markers" result yet — the
    // marker's attributes must still resolve from `plan.markers` itself, not
    // sit on the plain divider until that button is clicked once by hand.
    renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });

    expect(screen.getByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)).toBeInTheDocument();
  });

  describe('manual remap marker attributes', () => {
    // Sums to 99 (17+17+27+21+17), unlike the module's default ATTRIBUTES
    // fixture (20 x 5 = 100) — legal from the moment the modal opens, so
    // Save doesn't start disabled and these tests aren't also exercising the
    // allocator's clamping (RemapMarkerModal.test.tsx already covers that).
    const LEGAL_ATTRIBUTES: Attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };

    // Position 2 == PLAN.entries.length: a marker after the last entry, same
    // as "Add remap marker" places one. optimizeAtMarkers gives that trailing
    // position no segment to remap (nothing follows it to speed up), so the
    // row starts on the plain "Remap marker" divider — the case a manual
    // override actually has something to add, unlike a marker mid-plan,
    // which the sibling describe block above already shows resolving to a
    // computed spread on its own.
    it('opens the editor seeded from the base sheet for a marker nothing has set yet, and Save persists the override', async () => {
      const user = userEvent.setup();
      const { onUpdate } = renderEditor(vi.fn(), {
        plan: { ...PLAN, markers: [2] },
        attributes: LEGAL_ATTRIBUTES,
      });

      await user.click(screen.getByRole('button', { name: 'Remap marker' }));
      const dialog = screen.getByRole('dialog', { name: 'Remap marker attributes' });
      expect(within(dialog).getByLabelText('Perception')).toHaveValue(27);

      // Intelligence and memory both sit at the 17 floor already, so the 3
      // points intelligence gains have to come off willpower (21), the only
      // other attribute with room above the floor.
      const intelligence = within(dialog).getByLabelText<HTMLInputElement>('Intelligence');
      const willpower = within(dialog).getByLabelText<HTMLInputElement>('Willpower');
      await user.clear(intelligence);
      await user.type(intelligence, '20');
      await user.clear(willpower);
      await user.type(willpower, '18');
      await user.tab();
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(onUpdate).toHaveBeenCalledWith({
        markerAttributes: [
          { intelligence: 20, memory: 17, perception: 27, willpower: 18, charisma: 17 },
        ],
      });
      expect(screen.queryByRole('dialog')).toBeNull();
      // The label is gone now that this marker has a spread to show instead.
      expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();
      expect(screen.getByText('PER 27 / INT 20 / WIL 18 / MEM 17 / CHA 17')).toBeInTheDocument();
    });

    it('offers no "Clear override" for a marker with nothing manual set, and Cancel leaves the plan untouched', async () => {
      const user = userEvent.setup();
      const { onUpdate } = renderEditor(vi.fn(), {
        plan: { ...PLAN, markers: [2] },
        attributes: LEGAL_ATTRIBUTES,
      });

      await user.click(screen.getByRole('button', { name: 'Remap marker' }));
      const dialog = screen.getByRole('dialog', { name: 'Remap marker attributes' });
      expect(within(dialog).queryByRole('button', { name: 'Clear override' })).toBeNull();

      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByText('Remap marker')).toBeInTheDocument();
    });

    it('reopens on an already-overridden marker showing the override, and "Clear override" reverts it', async () => {
      const user = userEvent.setup();
      const { onUpdate } = renderEditor(vi.fn(), {
        plan: { ...PLAN, markers: [2], markerAttributes: [LEGAL_ATTRIBUTES] },
        attributes: LEGAL_ATTRIBUTES,
      });

      // The override already renders as the marker's spread, not the divider.
      expect(screen.getByText('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17')).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17' })
      );
      const dialog = screen.getByRole('dialog', { name: 'Remap marker attributes' });
      expect(within(dialog).getByLabelText('Perception')).toHaveValue(27);

      await user.click(within(dialog).getByRole('button', { name: 'Clear override' }));
      expect(onUpdate).toHaveBeenCalledWith({ markerAttributes: [null] });
      // No optimizer result covers this marker, so clearing the override
      // drops it back to the plain divider rather than a different spread.
      expect(screen.getByText('Remap marker')).toBeInTheDocument();
    });
  });

  it('gives two markers that delimit the same optimizer step the same attribute display, not one shifted onto the wrong segment', async () => {
    // Skill C sits between markers 0 and 1 already trained to its target
    // level, so it contributes zero steps: entry positions 1 (before C) and
    // 2 (before B) land on the identical step index, which optimizeAtMarkers
    // dedupes into one remap segment. Marker 2 (before D) is a later,
    // distinct step. Indexing the remapped segments by marker ordinal
    // (rather than by the step index each marker actually sits at) would
    // read marker 1 off the wrong (D's) segment and leave marker 2 with none.
    const localSkills: SkillType[] = [
      skill({ typeID: 10, name: 'Skill A', primaryAttr: 'intelligence', secondaryAttr: 'memory' }),
      skill({ typeID: 30, name: 'Skill C', primaryAttr: 'intelligence', secondaryAttr: 'memory' }),
      skill({ typeID: 20, name: 'Skill B', primaryAttr: 'perception', secondaryAttr: 'willpower' }),
      skill({
        typeID: 40,
        name: 'Skill D',
        primaryAttr: 'charisma',
        secondaryAttr: 'intelligence',
      }),
    ];
    const engineSkills = new Map(
      localSkills.map((s) => [
        s.typeID,
        {
          typeID: s.typeID,
          name: s.name,
          rank: s.rank,
          primary: s.primaryAttr,
          secondary: s.secondaryAttr,
          prereqs: [],
        },
      ])
    );
    const localCatalog: SkillCatalog = {
      engineSkills,
      bySkillTypeID: new Map(localSkills.map((s) => [s.typeID, s])),
      unlocksByTypeID: buildUnlockIndex(engineSkills),
    };
    const localPlan: SkillPlanRecord = {
      ...PLAN,
      entries: [
        { skillTypeID: 10, targetLevel: 1 },
        { skillTypeID: 30, targetLevel: 1 },
        { skillTypeID: 20, targetLevel: 1 },
        { skillTypeID: 40, targetLevel: 1 },
      ],
      markers: [1, 2, 3],
    };
    const trained: ReadonlyMap<number, TrainedSkill> = new Map([[30, { level: 1, sp: 0 }]]);

    const user = userEvent.setup();
    renderEditor(vi.fn(), { plan: localPlan, catalog: localCatalog, trainedSkills: trained });
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize at my markers' }));

    // remapInstruction's own format: five "XXX N" terms joined by " / ",
    // which only a marker row's attribute spread (never an attribute-pair
    // badge or a band header) matches.
    const entriesPanel = screen.getByRole('heading', { name: 'Your entries' }).closest('section')!;
    const attributeTexts = within(entriesPanel)
      .getAllByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)
      .map((el) => el.textContent);

    expect(attributeTexts).toHaveLength(3);
    expect(attributeTexts[0]).toBe(attributeTexts[1]);
    expect(attributeTexts[2]).not.toBe(attributeTexts[0]);
  });
});

describe('PlanEditor tools pane placement', () => {
  it('folds the tools into one collapsed disclosure below `lg`, so the plan leads the page', () => {
    renderEditor();

    const toggle = screen.getByRole('button', { name: /plan tools/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Nothing inside the tools pane is mounted while collapsed — the whole
    // tool set costs one row, where it used to cost three panels.
    expect(screen.queryByRole('button', { name: 'Optimize remaps' })).toBeNull();
    expect(screen.queryByLabelText('What-if implants')).toBeNull();
    // Import/Export portals to the page header, not the tools pane — on
    // screen regardless of the disclosure's state.
    expect(screen.getByRole('button', { name: 'Import from skill queue' })).toBeInTheDocument();
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

describe('PlanEditor: the attributes every estimate is costed against', () => {
  it("shows ESI's own reading, not the scheduler's fallback base sheet", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('Intelligence')).toBeInTheDocument();
    expect(within(section).getByText('24')).toBeInTheDocument();
    expect(within(section).getByText('25')).toBeInTheDocument();
    // `attributes` (what computeSchedule runs on) is all 20s here, and falls
    // back to placeholder numbers when ESI can't be read — presenting it as
    // the character's own sheet is exactly the mistake to avoid.
    expect(within(section).queryByText('20')).toBeNull();
    // The caption naming which half of the section is fact. Asserted on the
    // rendered text, not the key: a mistyped key renders as its own name and
    // nothing else in the gate — `tsc` included — can see that.
    expect(within(section).getByText(/current sheet/i)).toBeInTheDocument();
  });

  it('dates the attributes, as every ESI-derived view must', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const badge = sectionFor('Attributes').querySelector('time');
    expect(badge).toHaveAttribute('datetime', ATTRIBUTES_RESULT.fetchedAt.toISOString());
  });

  it("keeps the chips on the clone's real implants when the what-if lens changes", async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      implants: { perception: 3 },
      attributesResult: {
        ...ATTRIBUTES_RESULT,
        data: { ...ATTRIBUTES_RESULT.data, perception: 25 },
      },
    });
    await openTools(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('22 + 3 = 25')).toBeInTheDocument();

    await user.selectOptions(within(section).getByLabelText('What-if implants'), '+5');

    // The lens re-costs the plan; it does not rewrite the character. "Current
    // attributes" has to keep meaning current, or the page has no honest
    // reading of the pilot left on it.
    expect(within(section).getByText('22 + 3 = 25')).toBeInTheDocument();
  });

  it('says the attributes are unknown when ESI could not be read, rather than inventing a sheet', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributesResult: null });
    await openTools(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('—')).toBeInTheDocument();
    expect(within(section).queryByText('Intelligence')).toBeNull();
    expect(section.querySelector('time')).toBeNull();
  });

  it('adds attributes only — general character stats explain nothing on this page', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    for (const label of ['Total SP', 'Unallocated SP', 'Wallet']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('costs no extra row below `lg`: the attributes ride the same collapsed tools disclosure', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: /plan tools/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    // No second always-open block above the entry list — the plan still leads
    // the page, and the attributes cost the same one tap as every other tool.
    expect(screen.queryByRole('heading', { name: 'Attributes' })).toBeNull();
    expect(screen.queryByText('Intelligence')).toBeNull();
  });

  it('shows them in the sidebar with no interaction at `lg`+, beside the lens that reinterprets them', () => {
    withDesktopViewport(() => {
      renderEditor();

      const sidebar = screen.getByTestId('plan-list-pane').closest('aside');
      if (!sidebar) throw new Error('expected a sidebar');
      const section = within(sidebar).getByRole('heading', { name: 'Attributes' });
      expect(section).toBeInTheDocument();
      expect(within(sidebar).getByText('24')).toBeInTheDocument();
      // Still one tools panel, not a fourth peer panel beside it.
      expect(within(sidebar).getAllByRole('heading', { name: 'Plan tools' })).toHaveLength(1);
    });
  });
});

describe('PlanEditor prereq promotion', () => {
  // Skill D needs Skill A at II, so a plan holding only D renders two dimmed
  // prereq rows (A I, A II) ahead of it.
  const PREREQ_SKILLS: SkillType[] = [
    SKILLS[0],
    skill({ typeID: 40, name: 'Skill D', prereqs: [{ skillTypeID: 10, level: 2 }] }),
  ];
  const PREREQ_CATALOG: SkillCatalog = (() => {
    const engineSkills = new Map(
      PREREQ_SKILLS.map((s) => [
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
      bySkillTypeID: new Map(PREREQ_SKILLS.map((s) => [s.typeID, s])),
      unlocksByTypeID: buildUnlockIndex(engineSkills),
    };
  })();

  it('promotes a dimmed prereq row into a real entry where the schedule already trains it', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <MemoryRouter>
        <PlanEditor
          characterId={1}
          plan={{ ...PLAN, entries: [{ skillTypeID: 40, targetLevel: 3 }] }}
          catalog={PREREQ_CATALOG}
          trainedSkills={NO_TRAINED}
          attributes={ATTRIBUTES}
          implants={IMPLANTS}
          attributesResult={null}
          remapInfo={null}
          listPane={<div data-testid="plan-list-pane" />}
          onUpdate={onUpdate}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Prereq')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Add Skill A II to the plan' }));

    expect(onUpdate).toHaveBeenCalledWith({
      entries: [
        { skillTypeID: 10, targetLevel: 2 },
        { skillTypeID: 40, targetLevel: 3 },
      ],
      markers: [],
      markerAttributes: [],
    });
    expect(screen.getByText('Skill A II is now a plan entry')).toBeInTheDocument();
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
  function renderWithImplants() {
    renderEditor(vi.fn(), { implants: FITTED });
  }

  it("opens on the clone's own per-slot implants, unmatched set and all", async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    expect(screen.getByLabelText<HTMLSelectElement>('What-if implants').value).toBe('current');
    expect(bonusInputValues()).toEqual(['0', '3', '4', '0', '0']);
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

    expect(bonusInputValues()).toEqual(['4', '4', '4', '4', '4']);
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

    expect(bonusInputValues()).toEqual(['4', '4', '5', '4', '4']);
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

    expect(bonusInputValues()).toEqual(['0', '3', '4', '0', '0']);
  });

  it('links to Market, scoped to the attribute enhancer implants category (issue #407)', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);

    await user.click(
      screen.getByRole('button', { name: 'View attribute enhancer implants in Market' })
    );

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/market?group=532');
  });
});

describe('PlanEditor booster market link (issue #407)', () => {
  it('links to Market, scoped to the booster category', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'View boosters in Market' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/market?group=977');
  });
});

/**
 * A cerebral accelerator is baked into the attributes ESI reports and comes
 * back out arithmetically (`engine/attributeBaseline.ts`). What the editor
 * owes the user is legibility: the correction is prefilled into the Booster
 * control they already know, editable, and the one field the app cannot read —
 * the expiry — is called out rather than invented.
 */
describe('a cerebral accelerator detected in the ESI sheet', () => {
  const ACCELERATED = {
    kind: 'accelerated' as const,
    acceleratorBonus: 12,
    attributes: { intelligence: 17, memory: 26, perception: 22, willpower: 17, charisma: 17 },
  };

  it('prefills the Booster control with the detected bonus and says where it came from', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Booster').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Bonus').value).toBe('12');
    expect(screen.getByText(/\+12 cerebral accelerator/i)).toBeInTheDocument();
  });

  it('leaves the expiry blank and warns that nothing is applied until it is set', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Expires').value).toBe('');
    expect(screen.getByText(/costed as if you had none/i)).toBeInTheDocument();
  });

  it('keeps the prefilled bonus editable, and does not stomp the edit back', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);

    const bonus = screen.getByLabelText('Bonus');
    await user.clear(bonus);
    await user.type(bonus, '8');

    expect(screen.getByLabelText<HTMLInputElement>('Bonus').value).toBe('8');
  });

  it('prefills whatever tier was detected, not a fixed number', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      attributeBaseline: { ...ACCELERATED, acceleratorBonus: 4 },
    });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Bonus').value).toBe('4');
  });

  it('still applies the accelerator once an expiry is given', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);

    await user.type(screen.getByLabelText('Expires'), '2099-01-01T00:00');

    expect(screen.queryByText(/costed as if you had none/i)).toBeNull();
  });
});

/**
 * The lenses every number on this page is costed under are part of the plan,
 * not of the session: a plan reopened on a different lens quotes different
 * training times than the ones its owner left it showing.
 */
describe('PlanEditor persists the lenses the plan is costed under', () => {
  it('saves a What-If Implants preset onto the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);

    await user.selectOptions(screen.getByLabelText('What-if implants'), '+4');

    expect(onUpdate).toHaveBeenCalledWith({ whatIfImplants: { kind: 'preset', preset: '+4' } });
  });

  it('saves a per-slot What-If set onto the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);

    const perception = screen.getByLabelText('Perception implant bonus');
    await user.clear(perception);
    await user.type(perception, '5');

    expect(onUpdate).toHaveBeenLastCalledWith({
      whatIfImplants: {
        kind: 'custom',
        bonuses: { intelligence: 0, memory: 3, perception: 5, willpower: 0, charisma: 0 },
      },
    });
  });

  it('reopens on the lens the plan was saved with', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      implants: FITTED,
      plan: { ...PLAN, whatIfImplants: { kind: 'preset', preset: '+5' } },
    });
    await openTools(user);

    expect(screen.getByLabelText<HTMLSelectElement>('What-if implants').value).toBe('+5');
    expect(bonusInputValues()).toEqual(['5', '5', '5', '5', '5']);
  });

  it('saves the whole Booster answer the first time any part of it is touched', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await user.click(screen.getByLabelText('Booster'));

    // Not just the box: a stored Booster is what tells the editor the user
    // has answered, so it has to carry the bonus and expiry it was showing.
    expect(onUpdate).toHaveBeenCalledWith({
      booster: { enabled: true, bonus: 3, expiresAt: null },
    });
  });

  it('stores the expiry as the instant the control names, not its wall-clock text', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await user.click(screen.getByLabelText('Booster'));
    await user.type(screen.getByLabelText('Expires'), '2099-01-01T00:00');

    // Local time, because that is what a datetime-local control means — and
    // an instant, because the plan syncs to devices in other timezones.
    expect(onUpdate).toHaveBeenLastCalledWith({
      booster: { enabled: true, bonus: 3, expiresAt: new Date(2099, 0, 1, 0, 0).getTime() },
    });
    expect(screen.getByLabelText<HTMLInputElement>('Expires').value).toBe('2099-01-01T00:00');
  });

  it('reopens on the Booster the plan was saved with', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      plan: {
        ...PLAN,
        booster: { enabled: true, bonus: 6, expiresAt: new Date(2099, 5, 2, 13, 45).getTime() },
      },
    });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Booster').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Bonus').value).toBe('6');
    expect(screen.getByLabelText<HTMLInputElement>('Expires').value).toBe('2099-06-02T13:45');
  });

  it('does not erase a saved expiry when the control reports an incomplete value', async () => {
    // The data-loss path: a native datetime-local reports '' for ANY
    // incomplete state, including a segment cleared to be retyped. Writing
    // null there would erase the stored expiry, re-cost the plan, and sync
    // the erasure away.
    const user = userEvent.setup();
    const saved = new Date(2099, 0, 1, 0, 0).getTime();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, booster: { enabled: true, bonus: 3, expiresAt: saved } },
    });
    await openTools(user);

    const expires = screen.getByLabelText<HTMLInputElement>('Expires');
    await user.clear(expires);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(expires.value).toBe('');
  });

  it('commits an emptied expiry on blur — clearing it IS an answer', async () => {
    const user = userEvent.setup();
    const saved = new Date(2099, 0, 1, 0, 0).getTime();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, booster: { enabled: true, bonus: 3, expiresAt: saved } },
    });
    await openTools(user);

    await user.clear(screen.getByLabelText('Expires'));
    await user.tab();

    expect(onUpdate).toHaveBeenCalledWith({
      booster: { enabled: true, bonus: 3, expiresAt: null },
    });
  });

  it('replaces a saved expiry in one write, never through a null in between', async () => {
    const user = userEvent.setup();
    const saved = new Date(2099, 0, 1, 0, 0).getTime();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, booster: { enabled: true, bonus: 3, expiresAt: saved } },
    });
    await openTools(user);

    const expires = screen.getByLabelText<HTMLInputElement>('Expires');
    await user.clear(expires);
    await user.type(expires, '2100-06-02T13:45');
    await user.tab();

    // One write, carrying the new instant. The incomplete states the control
    // reports along the way must not each land on the plan.
    expect(onUpdate.mock.calls).toEqual([
      [{ booster: { enabled: true, bonus: 3, expiresAt: new Date(2100, 5, 2, 13, 45).getTime() } }],
    ]);
  });

  it('clamps the bonus where it is written, not only where it is read', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, booster: { enabled: true, bonus: 3, expiresAt: null } },
    });
    await openTools(user);

    const bonus = screen.getByLabelText('Bonus');
    await user.clear(bonus);
    await user.type(bonus, '45');

    // Never a stored 45 the plan is not costed under.
    expect(onUpdate).toHaveBeenLastCalledWith({
      booster: { enabled: true, bonus: 30, expiresAt: null },
    });
  });

  it('does not re-prefill a detected accelerator over a saved "no booster" answer', async () => {
    // Unticking the box is a legitimate answer — "that accelerator is gone" —
    // and the prefill must not overrule it on the next visit.
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      attributeBaseline: {
        kind: 'accelerated',
        acceleratorBonus: 12,
        attributes: ATTRIBUTES,
      },
      plan: { ...PLAN, booster: { enabled: false, bonus: 12, expiresAt: null } },
    });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Booster').checked).toBe(false);
  });
});

describe('a character with no accelerator', () => {
  // The normal state, and a total no-op: same control, same defaults, nothing
  // said. Asserted on its own rather than as a corollary of the case above,
  // because "detection fires on a clean sheet" is the way this fix breaks.
  it.each([
    ['a legal sheet', { kind: 'legal' as const, attributes: ATTRIBUTES }],
    ['ESI not read yet', null],
    ['no baseline passed at all', undefined],
  ])('says nothing and changes nothing for %s', async (_label, attributeBaseline) => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), attributeBaseline === undefined ? {} : { attributeBaseline });
    await openTools(user);

    expect(screen.getByLabelText<HTMLInputElement>('Booster').checked).toBe(false);
    expect(screen.queryByText(/cerebral accelerator/i)).toBeNull();
    expect(screen.queryByText(/costed as if you had none/i)).toBeNull();
    expect(screen.queryByText(/cannot be read/i)).toBeNull();
  });
});

describe('an attribute sheet nothing explains', () => {
  it('says the sheet could not be read instead of quietly estimating from it', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      attributeBaseline: {
        kind: 'impossible',
        reported: { intelligence: 29, memory: 38, perception: 34, willpower: 29, charisma: 30 },
        reportedTotal: 160,
      },
    });
    await openTools(user);

    expect(screen.getByText(/totalling 160/i)).toBeInTheDocument();
    // No accelerator was recovered, so nothing is prefilled either.
    expect(screen.getByLabelText<HTMLInputElement>('Booster').checked).toBe(false);
  });
});

describe('removing an entry requires confirmation (#408)', () => {
  it('does not remove the entry until the confirmation Modal is accepted', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('button', { name: /remove skill a/i }));
    // Clicking Remove on the row only opens the Modal — the entry survives
    // until the Modal's own Remove button is clicked.
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/remove "skill a" from this plan/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [{ skillTypeID: 20, targetLevel: 1, priority: 'high' }] })
    );
  });

  it('Cancel leaves the entry untouched and closes the Modal', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('button', { name: /remove skill a/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByText(/remove "skill a" from this plan/i)).not.toBeInTheDocument();
  });
});
