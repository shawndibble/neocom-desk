import { DAY_MS } from '@/lib/age';
import { useEffect, useState, type ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubViewport } from '@/test/viewport';
import { PHONE_QUERY } from '@/lib/useIsPhone';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import type { Attributes, Implants, TrainedSkill } from '@/engine/types';
import { db, type SkillPlanRecord } from '@/db';
import { seedGrant } from '@/test/seed';
import type { CachedResult } from '@/features/skills/data';
import type { CharacterAttributes, SkillQueueEntry } from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';
import { buildUnlockIndex } from '@/engine/skills/skillUnlocks';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { SkillCatalog } from '../skillMap';
import type { RemapAvailability } from './remapAvailability';
import { PlanEditor } from './PlanEditor';
import { DEFAULT_GROUPING_MODE, useGroupingMode } from './groupingMode';
import { previewImportFile } from './importPreview';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const loadCharacterSkillQueue =
  vi.fn<(characterId: number) => Promise<CachedResult<SkillQueueEntry[]> | null>>();

vi.mock('@/market/prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/market/prices')>()),
  getHubPricesWithStatus: vi.fn(async (_hub: unknown, ids: readonly number[]) => ({
    prices: new Map(ids.filter((id) => id === 10).map((id) => [id, { sellMin: 1_500_000 }])),
    unreachable: false,
  })),
  getRegionSellPrices: vi.fn(async () => new Map<number, number | null>()),
}));

vi.mock('./importPreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./importPreview')>()),
  previewImportFile: vi.fn(),
}));
vi.mock('./jumpCloneImplants', () => ({ useJumpCloneImplantSets: () => [] }));

vi.mock('../data', () => ({
  loadCharacterSkillQueue: (characterId: number) => loadCharacterSkillQueue(characterId),
}));

function queueResult(entries: SkillQueueEntry[]): CachedResult<SkillQueueEntry[]> {
  return { data: entries, fetchedAt: new Date(), fromCache: false, truncated: false };
}

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

function renderEditor(
  onUpdate = vi.fn(),
  overrides: Partial<ComponentProps<typeof PlanEditor>> = {}
) {
  const { plan: initialPlan = PLAN, ...rest } = overrides;
  const control: { replacePlan?: (next: (current: SkillPlanRecord) => SkillPlanRecord) => void } =
    {};

  function Harness() {
    const [plan, setPlan] = useState(initialPlan);
    useEffect(() => {
      control.replacePlan = setPlan;
    }, []);
    const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);
    return (
      <>
        <div ref={setHeaderActionsEl} />
        <PlanEditor
          characterId={1}
          plan={plan}
          catalog={CATALOG}
          trainedSkills={NO_TRAINED}
          trainedSkillsKnown
          attributes={ATTRIBUTES}
          implants={IMPLANTS}
          attributesResult={ATTRIBUTES_RESULT}
          remapInfo={null}
          listPane={<div data-testid="plan-list-pane" />}
          headerActionsContainer={headerActionsEl}
          {...rest}
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
  return {
    onUpdate,
    replacePlan: (next: (current: SkillPlanRecord) => SkillPlanRecord) =>
      act(() => control.replacePlan?.(next)),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname + location.search}</div>;
}

function bonusInputValues(): string[] {
  return ['Intelligence', 'Memory', 'Perception', 'Willpower', 'Charisma'].map(
    (attribute) => screen.getByLabelText<HTMLInputElement>(`${attribute} implant bonus`).value
  );
}

async function chooseWhatIf(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
  await user.click(await screen.findByRole('option', { name: option }));
}

const FITTED: Implants = { perception: 4, memory: 3 };

async function importFromQueue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Import' }));
  await user.click(screen.getByRole('menuitem', { name: 'From skill queue' }));
}

async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /plan tools/i }));
}

async function openAssumptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^assumptions/i }));
}

async function clickOptimizeMode(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Optimize' }));
  await user.click(screen.getByRole('menuitem', { name }));
}

function sectionFor(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title }).closest('section');
  if (!section) throw new Error(`expected a section for "${title}"`);
  return section as HTMLElement;
}

function withDesktopViewport(body: () => void) {
  stubViewport(() => true);
  body();
}
beforeEach(async () => {
  await db.characterAccelerators.clear();
});

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
    await openAssumptions(user);

    const actions = sectionFor('Actions');
    const attributesSection = sectionFor('Attributes');

    expect(within(actions).getByRole('button', { name: 'Optimize' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Add remap marker' })).toBeInTheDocument();
    for (const name of ['Optimize remaps', 'Optimize at my markers', 'Suggest reorder']) {
      expect(within(actions).queryByRole('button', { name })).toBeNull();
    }
    expect(within(actions).getByText(/^Remaps: 1 /)).toBeInTheDocument();

    await user.click(within(actions).getByRole('button', { name: 'Optimize' }));
    for (const name of [
      'Optimize for me',
      'Reorder only',
      'Shortest first',
      'Place remaps only',
      'Use my remap markers',
    ]) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}');

    expect(within(attributesSection).getByText('INT')).toBeInTheDocument();
    expect(within(attributesSection).queryByLabelText('What-if implants')).toBeNull();
    expect(screen.getByLabelText('What-if implants')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add accelerator' })).toBeInTheDocument();

    for (const name of ['Import', 'Export']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
      expect(within(actions).queryByRole('button', { name })).toBeNull();
    }
  });

  it('renders each Actions-section control as one full-width labelled row, not an icon-only control', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    for (const name of ['Optimize', 'Add remap marker']) {
      const button = screen.getByRole('button', { name });
      expect(button).not.toHaveAttribute('aria-label');
      expect(button.textContent).toBe(name);
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('justify-start');
    }
  });

  it('renders Import/Export as labelled menu buttons (portaled to the page header)', () => {
    renderEditor();

    for (const name of ['Import', 'Export']) {
      const button = screen.getByRole('button', { name });
      expect(button).not.toHaveAttribute('aria-label');
      expect(button.textContent).toBe(name);
    }
  });

  it('opens the import dialog, titled "Import plan", from Import > From text or file', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'From text or file' }));

    expect(await screen.findByRole('dialog', { name: 'Import plan' })).toBeInTheDocument();
  });

  it('imports a plan file dropped on the editor without opening the dialog, with Undo', async () => {
    vi.mocked(previewImportFile).mockResolvedValueOnce({
      mode: 'planXml',
      entries: [{ skillTypeID: 10, targetLevel: 3 }],
      warnings: [],
      errors: [],
    });
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderEditor(onUpdate);

    const file = new File(['<plan/>'], 'p.xml');
    fireEvent.drop(screen.getByText('Your entries'), {
      dataTransfer: { files: [file], types: ['Files'] },
    });

    expect(await screen.findByText(/^Added/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Import plan' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ entries: PLAN.entries }));
  });

  it('opens the dialog on the preview when a dropped plan file has entries that fail', async () => {
    vi.mocked(previewImportFile).mockResolvedValueOnce({
      mode: 'planXml',
      entries: [{ skillTypeID: 10, targetLevel: 3 }],
      warnings: [],
      errors: [{ line: 2, text: 'entry[1]', reason: 'unknown skill' }],
    });
    const onUpdate = vi.fn();
    renderEditor(onUpdate);

    fireEvent.drop(screen.getByText('Your entries'), {
      dataTransfer: { files: [new File(['<plan/>'], 'p.xml')], types: ['Files'] },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    expect(within(dialog).getByRole('button', { name: 'Append to plan' })).toBeEnabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('folds Import and Export into one ⋮ menu on a phone (#6562)', async () => {
    stubViewport((query) => query === PHONE_QUERY);
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'From skill queue' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'From text or file' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export table' })).toBeInTheDocument();
  });

  it("doesn't render Import/Export when the caller has no header-actions slot to portal into", () => {
    renderEditor(vi.fn(), { headerActionsContainer: null });

    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('keeps the entry list out of the tools pane, so the plan itself stays the main column', () => {
    renderEditor();

    expect(screen.getByRole('button', { name: /plan tools/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('heading', { name: 'Your entries' })).toBeInTheDocument();
    expect(screen.getByText('Skill A')).toBeInTheDocument();
  });

  it('collapses Export into one control that reveals "to clipboard" / the "Export table" submenu only after being opened', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    expect(screen.queryByRole('menuitem', { name: 'Export to clipboard' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Export table' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('menuitem', { name: 'Export to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export table' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalledTimes(1));
  });

  it("opens Suggest reorder's preview in a Modal; Accept applies the reorder and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await clickOptimizeMode(user, 'Reorder only');

    const dialog = screen.getByRole('dialog', { name: 'Suggested reorder' });
    expect(within(dialog).getAllByText('Skill B I').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Skill A I').length).toBeGreaterThan(0);

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

    await clickOptimizeMode(user, 'Reorder only');
    const dialog = screen.getByRole('dialog', { name: 'Suggested reorder' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("opens Shortest first's preview in a Modal; Accept applies the reorder and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await clickOptimizeMode(user, 'Shortest first');

    const dialog = screen.getByRole('dialog', { name: 'Suggested shortest-first sort' });
    expect(within(dialog).getAllByText('Skill B I').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Skill A I').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledWith({
      entries: [
        { skillTypeID: 20, targetLevel: 1, priority: 'high' },
        { skillTypeID: 10, targetLevel: 1 },
      ],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Shortest first Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await clickOptimizeMode(user, 'Shortest first');
    const dialog = screen.getByRole('dialog', { name: 'Suggested shortest-first sort' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("opens Optimize remaps' preview in a Modal when it finds savings; Accept applies the segments as markers and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await clickOptimizeMode(user, 'Place remaps only');

    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    expect(within(dialog).getByText(/^Remapping saves/)).toBeInTheDocument();
    expect(within(dialog).getByText('Segment 1')).toBeInTheDocument();
    expect(within(sectionFor('Actions')).getByRole('status')).toHaveTextContent(/^Saves/);

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledWith({ markers: [1], markerAttributes: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Optimize remaps Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await clickOptimizeMode(user, 'Place remaps only');
    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('drops an open Optimize remaps result once the plan it was costed against changes (BUG #1)', async () => {
    const user = userEvent.setup();
    const { replacePlan } = renderEditor();
    await openTools(user);

    await clickOptimizeMode(user, 'Place remaps only');
    expect(screen.getByRole('dialog', { name: 'Optimize remaps' })).toBeInTheDocument();

    replacePlan((current) => ({ ...current, entries: [...current.entries].reverse() }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(sectionFor('Actions')).queryByRole('status')).toBeNull();
  });

  it('drops an open Suggest reorder preview when a different plan is swapped in (BUG #1)', async () => {
    const user = userEvent.setup();
    const { replacePlan } = renderEditor();
    await openTools(user);

    await clickOptimizeMode(user, 'Reorder only');
    expect(screen.getByRole('dialog', { name: 'Suggested reorder' })).toBeInTheDocument();

    replacePlan((current) => ({ ...current, id: 'plan-2' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Optimize for me" previews the reorder and remaps together; Accept writes both in one update (#1411)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();

    await clickOptimizeMode(user, 'Optimize for me');

    const dialog = screen.getByRole('dialog', { name: 'Optimize for me' });
    expect(within(dialog).getAllByText('Skill B I')).toHaveLength(2);
    expect(within(dialog).getAllByText('Skill A I')).toHaveLength(2);
    expect(within(dialog).getByText(/^Total /)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Current · /)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Optimized · /)).toBeInTheDocument();
    expect(within(dialog).getByText('moves to 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Moved up 1 place')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [patch] = onUpdate.mock.calls[0];
    expect(patch.entries).toEqual([
      { skillTypeID: 20, targetLevel: 1, priority: 'high' },
      { skillTypeID: 10, targetLevel: 1 },
    ]);
    expect(Array.isArray(patch.markers)).toBe(true);
    expect(patch.markerAttributes).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Optimize for me" says there is nothing to gain instead of listing a reshuffle that saves no time', async () => {
    const user = userEvent.setup();
    const plan = { ...PLAN, entries: [{ skillTypeID: 10, targetLevel: 1 }] };
    const attributes: Attributes = {
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
    };
    const { onUpdate } = renderEditor(vi.fn(), { plan, attributes });
    await openTools(user);

    await clickOptimizeMode(user, 'Optimize for me');
    const dialog = screen.getByRole('dialog', { name: 'Optimize for me' });

    expect(within(dialog).getByText(/^Nothing to gain/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Accept' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Reject closes the "Optimize for me" Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);

    await clickOptimizeMode(user, 'Optimize for me');
    const dialog = screen.getByRole('dialog', { name: 'Optimize for me' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Use my remap markers" is disabled with a reason when the plan has no Remap Markers yet', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    await user.click(screen.getByRole('button', { name: 'Optimize' }));
    const item = screen.getByRole('menuitem', { name: 'Use my remap markers' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(within(item).getByText('Add a remap marker first')).toBeInTheDocument();
  });

  it('opens the Optimize remaps Modal even with no savings, offering only Close', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, remapCount: 0 } });
    await openTools(user);

    await clickOptimizeMode(user, 'Place remaps only');

    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    expect(
      within(dialog).getByText('This plan has no remaps to spend, so none were placed.')
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

    await clickOptimizeMode(user, 'Place remaps only');
    const dialog = screen.getByRole('dialog', { name: 'Optimize remaps' });
    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    const entriesPanel = screen.getByRole('heading', { name: 'Your entries' }).closest('section')!;
    expect(
      within(entriesPanel).getByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)
    ).toBeInTheDocument();
  });

  it('Your entries header carries no total or finish readout (#1414)', () => {
    renderEditor(vi.fn());
    const header = screen.getByRole('heading', { name: 'Your entries' }).parentElement!;
    expect(within(header).queryByText(/Finishes/)).not.toBeInTheDocument();
    expect(header.textContent).toBe('Your entries');
  });

  it('starts the plan when the live queue ends and shows the queue as a collapsed lead line (#1403)', () => {
    renderEditor(vi.fn(), {
      queueEntries: [
        {
          skill_id: 999999,
          queue_position: 0,
          finished_level: 3,
          start_date: '2098-12-01T00:00:00Z',
          finish_date: '2099-01-01T12:00:00Z',
        },
      ],
    });
    expect(screen.getAllByText(/^2099-01-0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Trains first in game: 1 skill, until 2099.01.0/)).toBeInTheDocument();
  });

  it("costs the plan's total training time and finish date per marker segment, not just the savings badge (#1232)", async () => {
    const override: Attributes = {
      intelligence: 19,
      memory: 19,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };
    renderEditor(vi.fn(), {
      plan: { ...PLAN, markers: [1], markerAttributes: [override] },
    });
    const summary = screen.getAllByText('Projected finish')[0].closest('section')!;
    expect(within(summary).getByText('15m')).toBeInTheDocument();
    expect(within(summary).queryByText('16m')).not.toBeInTheDocument();
    expect(within(summary).queryByText('17m')).not.toBeInTheDocument();
  });

  it("opens Optimize at my markers' preview in a Modal when it finds savings; Accept re-applies the segments as markers and closes it", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });
    await openTools(user);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(sectionFor('Actions')).getByText(/^Saves/)).toBeInTheDocument();

    await clickOptimizeMode(user, 'Use my remap markers');

    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });
    expect(within(dialog).getByText(/^Remapping saves/)).toBeInTheDocument();
    expect(within(dialog).getByText('Segment 1')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledWith({ markers: [1], markerAttributes: [] });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Reject closes the Optimize at my markers Modal without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });
    await openTools(user);

    await clickOptimizeMode(user, 'Use my remap markers');
    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the Optimize at my markers Modal even with no savings, offering only Close', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: { ...PLAN, markers: [PLAN.entries.length] },
    });
    await openTools(user);

    await clickOptimizeMode(user, 'Use my remap markers');

    const dialog = screen.getByRole('dialog', { name: 'Optimize at my markers' });
    expect(
      within(dialog).getByText(
        'Every remap marker is at the end of the plan, so it speeds up nothing. Drag a marker above the skills it should speed up.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Accept' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Dismiss' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows a marker's target attributes on first mount too, not only after an explicit optimize click", () => {
    renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });

    expect(screen.getByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)).toBeInTheDocument();
  });

  describe('manual remap marker attributes', () => {
    const LEGAL_ATTRIBUTES: Attributes = {
      intelligence: 17,
      memory: 17,
      perception: 27,
      willpower: 21,
      charisma: 17,
    };

    it('opens the editor seeded from the base sheet for a marker nothing has set yet, and Save persists the override', async () => {
      const user = userEvent.setup();
      const { onUpdate } = renderEditor(vi.fn(), {
        plan: { ...PLAN, markers: [2] },
        attributes: LEGAL_ATTRIBUTES,
      });

      await user.click(screen.getByRole('button', { name: 'Remap marker 1' }));
      const dialog = screen.getByRole('dialog', { name: 'Remap marker attributes' });
      expect(within(dialog).getByLabelText('Perception')).toHaveValue(27);

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
      expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();
      expect(screen.getByText('PER 27 / INT 20 / WIL 18 / MEM 17 / CHA 17')).toBeInTheDocument();
    });

    it('offers no "Clear override" for a marker with nothing manual set, and Cancel leaves the plan untouched', async () => {
      const user = userEvent.setup();
      const { onUpdate } = renderEditor(vi.fn(), {
        plan: { ...PLAN, markers: [2] },
        attributes: LEGAL_ATTRIBUTES,
      });

      await user.click(screen.getByRole('button', { name: 'Remap marker 1' }));
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

      expect(screen.getByText('PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17')).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'PER 27 / WIL 21 / INT 17 / MEM 17 / CHA 17' })
      );
      const dialog = screen.getByRole('dialog', { name: 'Remap marker attributes' });
      expect(within(dialog).getByLabelText('Perception')).toHaveValue(27);

      await user.click(within(dialog).getByRole('button', { name: 'Clear override' }));
      expect(onUpdate).toHaveBeenCalledWith({ markerAttributes: [null] });
      expect(screen.getByText('Remap marker')).toBeInTheDocument();
    });
  });

  it('gives two markers that delimit the same optimizer step the same attribute display, not one shifted onto the wrong segment', async () => {
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

    await clickOptimizeMode(user, 'Use my remap markers');

    const entriesPanel = screen.getByRole('heading', { name: 'Your entries' }).closest('section')!;
    const attributeTexts = within(entriesPanel)
      .getAllByText(/^([A-Z]{3} \d+)( \/ [A-Z]{3} \d+){4}$/)
      .map((el) => el.textContent);

    expect(attributeTexts).toHaveLength(3);
    expect(attributeTexts[0]).toBe(attributeTexts[1]);
    expect(attributeTexts[2]).not.toBe(attributeTexts[0]);
  });
});

describe('"Optimize for me" never previews or writes a redundant remap (real report)', () => {
  const PW_SKILLS: SkillType[] = [
    skill({
      typeID: 41,
      name: 'Skill A',
      rank: 5,
      primaryAttr: 'perception',
      secondaryAttr: 'willpower',
    }),
    skill({
      typeID: 42,
      name: 'Skill B',
      rank: 1,
      primaryAttr: 'intelligence',
      secondaryAttr: 'memory',
      prereqs: [{ skillTypeID: 41, level: 2 }],
    }),
    skill({
      typeID: 43,
      name: 'Skill C',
      rank: 5,
      primaryAttr: 'perception',
      secondaryAttr: 'willpower',
    }),
  ];
  const PW_CATALOG: SkillCatalog = (() => {
    const engineSkills = new Map(
      PW_SKILLS.map((s) => [
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
      bySkillTypeID: new Map(PW_SKILLS.map((s) => [s.typeID, s])),
      unlocksByTypeID: buildUnlockIndex(engineSkills),
    };
  })();
  const PW_PLAN: SkillPlanRecord = {
    id: 'plan-pw',
    characterId: 1,
    name: 'PW plan',
    entries: [
      { skillTypeID: 42, targetLevel: 1 },
      { skillTypeID: 43, targetLevel: 1 },
      { skillTypeID: 43, targetLevel: 2 },
      { skillTypeID: 43, targetLevel: 3 },
      { skillTypeID: 43, targetLevel: 4 },
      { skillTypeID: 43, targetLevel: 5 },
    ],
    remapCount: 2,
    markers: [],
    updatedAt: 0,
  };

  it('collapses the redundant segment in the preview itself, before Accept', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: PW_PLAN, catalog: PW_CATALOG });
    await openTools(user);

    await clickOptimizeMode(user, 'Optimize for me');

    const dialog = screen.getByRole('dialog', { name: 'Optimize for me' });
    expect(within(dialog).getAllByText('New remap marker.')).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: 'Accept' }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [patch] = onUpdate.mock.calls[0];
    expect(patch.markers).toHaveLength(1);
  });
});

describe('Remove trained skills', () => {
  const trained: ReadonlyMap<number, TrainedSkill> = new Map([[10, { level: 1, sp: 0 }]]);

  it('is absent when the character has trained nothing in the plan', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);
    expect(
      within(sectionFor('Actions')).queryByRole('button', { name: 'Remove trained skills' })
    ).toBeNull();
  });

  it('drops the trained rows, says how many, and Undo puts them back', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    renderEditor(onUpdate, { trainedSkills: trained });
    await openTools(user);
    const actions = sectionFor('Actions');
    await user.click(within(actions).getByRole('button', { name: 'Remove trained skills' }));
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ entries: [{ skillTypeID: 20, targetLevel: 1, priority: 'high' }] })
    );
    expect(within(actions).getByText('Removed 1 trained skill')).toBeInTheDocument();
    await user.click(within(actions).getByRole('button', { name: 'Undo' }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ entries: PLAN.entries }));
    expect(within(actions).queryByText('Removed 1 trained skill')).toBeNull();
  });
});

describe('PlanEditor tools pane placement', () => {
  it('folds the tools into one collapsed disclosure below `lg`, so the plan leads the page', () => {
    renderEditor();

    const toggle = screen.getByRole('button', { name: /plan tools/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Optimize' })).toBeNull();
    expect(screen.queryByLabelText('What-if implants')).toBeNull();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('puts the tools in the sidebar under the plan list at `lg`+, always open', () => {
    withDesktopViewport(() => {
      renderEditor();

      expect(screen.queryByRole('button', { name: /^plan tools$/i })).toBeNull();
      expect(screen.getByRole('heading', { name: 'Plan tools' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Optimize' })).toBeInTheDocument();

      const sidebar = screen.getByTestId('plan-list-pane').closest('aside');
      if (!sidebar) throw new Error('expected the tools to share the sidebar with the plan list');
      expect(within(sidebar).getByRole('heading', { name: 'Plan tools' })).toBeInTheDocument();
    });
  });
});

describe('PlanEditor Assumptions disclosure', () => {
  it('is closed by default and reads Defaults when nothing is set', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const toggle = screen.getByRole('button', { name: /^assumptions/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Defaults');
    expect(screen.queryByLabelText('Alpha clone')).toBeNull();
    expect(screen.queryByLabelText('What-if implants')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add accelerator' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Skill injectors' })).toBeNull();
  });

  it('opens on Alpha, What-if implants, Booster and Skill injectors', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);
    await openAssumptions(user);

    expect(screen.getByRole('button', { name: /^assumptions/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByLabelText('Alpha clone')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add accelerator' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Skill injectors' })).toBeInTheDocument();
  });

  it('summarises what is set while closed', async () => {
    const user = userEvent.setup();
    await seedAccelerator(12, Date.UTC(2099, 0, 1));
    renderEditor(vi.fn(), {
      plan: { ...PLAN, whatIfImplants: { kind: 'preset', preset: '+5' } },
    });
    await openTools(user);

    expect(await screen.findByRole('button', { name: /^assumptions/i })).toHaveTextContent(
      '+5 implants · Accelerator'
    );
  });

  it('does not claim an Accelerator the scheduler is not applying', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      attributeBaseline: {
        kind: 'accelerated',
        acceleratorBonus: 12,
        attributes: { intelligence: 17, memory: 26, perception: 22, willpower: 17, charisma: 17 },
      },
    });
    await openTools(user);

    expect(screen.getByRole('button', { name: /^assumptions/i })).toHaveTextContent('Defaults');
  });
});

describe('PlanEditor Skills to buy placement', () => {
  it('sits directly under Attributes in the sidebar at `lg`+, ahead of the Assumptions row', () => {
    withDesktopViewport(() => {
      renderEditor();

      const sidebar = screen.getByTestId('plan-list-pane').closest('aside');
      if (!sidebar) throw new Error('expected a sidebar');
      const headings = within(sidebar)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent);
      expect(headings).toEqual(['Actions', 'Attributes', 'Skills to buy']);

      const skillsToBuy = within(sidebar).getByRole('heading', { name: 'Skills to buy' });
      const assumptions = within(sidebar).getByRole('button', { name: /^assumptions/i });
      expect(
        skillsToBuy.compareDocumentPosition(assumptions) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  it('gets its own row with the total below `lg`, outside the collapsed Plan tools', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole('button', { name: /plan tools/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    const row = await screen.findByRole('button', { name: /^skills to buy.*1\.5M ISK/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('1 priced · 1 without a price')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy multibuy list/i })).toBeNull();

    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Copy multibuy list' })).toBeInTheDocument();
    expect(
      screen.getByText('1 skill without a price is left out of the total.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plan tools/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('keeps the list out of the expanded Plan tools below `lg`', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    expect(screen.queryByRole('heading', { name: 'Skills to buy' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^skills to buy/i })).toHaveLength(1);
  });
});

describe('PlanEditor: the attributes every estimate is costed against', () => {
  it("shows ESI's own reading, not the scheduler's fallback base sheet", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('INT')).toBeInTheDocument();
    expect(within(section).getByText('24')).toBeInTheDocument();
    expect(within(section).getByText('25')).toBeInTheDocument();
    expect(within(section).queryByText('20')).toBeNull();
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
    await openAssumptions(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('22 base + 3 implant = 25')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
    await user.click(await screen.findByRole('option', { name: '+5' }));

    expect(within(section).getByText('22 base + 3 implant = 25')).toBeInTheDocument();
  });

  it('says the attributes are unknown when ESI could not be read, rather than inventing a sheet', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributesResult: null });
    await openTools(user);

    const section = sectionFor('Attributes');
    expect(within(section).getByText('—')).toBeInTheDocument();
    expect(within(section).queryByText('INT')).toBeNull();
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
    expect(screen.queryByRole('heading', { name: 'Attributes' })).toBeNull();
    expect(screen.queryByText('INT')).toBeNull();
  });

  it('shows them in the sidebar with no interaction at `lg`+, beside the lens that reinterprets them', () => {
    withDesktopViewport(() => {
      renderEditor();

      const sidebar = screen.getByTestId('plan-list-pane').closest('aside');
      if (!sidebar) throw new Error('expected a sidebar');
      const section = within(sidebar).getByRole('heading', { name: 'Attributes' });
      expect(section).toBeInTheDocument();
      expect(within(sidebar).getByText('24')).toBeInTheDocument();
      expect(within(sidebar).getAllByRole('heading', { name: 'Plan tools' })).toHaveLength(1);
    });
  });
});

describe('PlanEditor prereq promotion', () => {
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
          trainedSkillsKnown
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
  beforeEach(() => {
    useGroupingMode.setState({ value: DEFAULT_GROUPING_MODE, hydrated: false });
  });

  it('defaults to Priority band headers', () => {
    renderEditor();

    expect(screen.getByText('High priority')).toBeInTheDocument();
  });

  it('draws no band header when every entry is Normal priority (#1415)', () => {
    renderEditor(vi.fn(), {
      plan: { ...PLAN, entries: PLAN.entries.map((e) => ({ ...e, priority: 'normal' as const })) },
    });

    expect(screen.queryByText('Normal priority')).not.toBeInTheDocument();
    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
  });

  it('switching to Attribute pair regroups the entry list without updating the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('combobox', { name: 'Group by' }));
    await user.click(await screen.findByRole('option', { name: 'Attribute pair' }));

    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
    expect(screen.getByText('PER/WIL attributes')).toBeInTheDocument();
    expect(screen.getByText('INT/MEM attributes')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("the phone's icon menu names the current grouping and regroups the same way", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Group by: Priority' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Attribute pair' }));

    expect(screen.queryByText('High priority')).not.toBeInTheDocument();
    expect(screen.getByText('PER/WIL attributes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group by: Attribute pair' })).toBeInTheDocument();
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
    await openAssumptions(user);

    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('Current');
    expect(screen.getByText('INT +0 · MEM +3 · PER +4 · WIL +0 · CHA +0')).toBeInTheDocument();
    expect(screen.queryByLabelText('Memory implant bonus')).toBeNull();
  });

  it('suppresses the platform spinner, which would break the row on hover', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);
    await chooseWhatIf(user, 'Custom');

    for (const attribute of ['Intelligence', 'Memory', 'Perception', 'Willpower', 'Charisma']) {
      expect(screen.getByLabelText(`${attribute} implant bonus`)).toHaveClass('field-no-spinner');
    }
  });

  it('a preset reads out all five with no inputs, and Custom is offered', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);

    await chooseWhatIf(user, '+4');

    expect(screen.getByText('INT +4 · MEM +4 · PER +4 · WIL +4 · CHA +4')).toBeInTheDocument();
    expect(screen.queryByLabelText('Memory implant bonus')).toBeNull();
    await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
    expect(await screen.findByRole('option', { name: 'Custom' })).toBeInTheDocument();
  });

  it('picking Custom seeds the inputs from the preset in force, unchanged', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);
    await openAssumptions(user);

    await chooseWhatIf(user, 'Custom');

    expect(bonusInputValues()).toEqual(['0', '3', '4', '0', '0']);
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('Custom');
    expect(onUpdate).toHaveBeenLastCalledWith({
      whatIfImplants: {
        kind: 'custom',
        bonuses: { intelligence: 0, memory: 3, perception: 4, willpower: 0, charisma: 0 },
      },
    });
  });

  it('editing one slot leaves the other four alone and stops claiming the preset', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);

    await chooseWhatIf(user, '+4');
    await chooseWhatIf(user, 'Custom');
    const perception = screen.getByLabelText('Perception implant bonus');
    await user.clear(perception);
    await user.type(perception, '5');

    expect(bonusInputValues()).toEqual(['4', '4', '5', '4', '4']);
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('Custom');
  });

  it('clamps a slot to the documented +0..+5 range', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);
    await chooseWhatIf(user, 'Custom');

    const memory = screen.getByLabelText('Memory implant bonus');
    await user.clear(memory);
    await user.type(memory, '9');

    expect(screen.getByLabelText<HTMLInputElement>('Memory implant bonus').value).toBe('5');
  });

  it('"Current" is still one click back to the real fitted set after experimenting', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);

    await chooseWhatIf(user, '+5');
    await chooseWhatIf(user, 'Custom');
    const charisma = screen.getByLabelText('Charisma implant bonus');
    await user.clear(charisma);
    await user.type(charisma, '1');
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('Custom');

    await chooseWhatIf(user, 'Current');

    expect(screen.getByText('INT +0 · MEM +3 · PER +4 · WIL +0 · CHA +0')).toBeInTheDocument();
    expect(screen.queryByLabelText('Memory implant bonus')).toBeNull();
  });

  it('links to Market, scoped to the attribute enhancer implants category (issue #407)', async () => {
    const user = userEvent.setup();
    renderWithImplants();
    await openTools(user);
    await openAssumptions(user);

    await user.click(
      screen.getByRole('link', { name: 'View attribute enhancer implants in Market' })
    );

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/market/browser?group=532');
  });
});

describe('PlanEditor Character details assumption note (issue #1526)', () => {
  const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;

  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  });

  afterEach(async () => {
    await db.tokens.clear();
  });

  it('shows the note when reading Current implants without the Character details scope', async () => {
    await seedGrant(1, []);
    renderEditor(vi.fn(), { implants: FITTED });

    expect(await screen.findByText('Assumes no implants')).toBeInTheDocument();
  });

  it('hides the note once Character details is granted', async () => {
    await seedGrant(1, [IMPLANTS_SCOPE]);
    renderEditor(vi.fn(), { implants: FITTED });

    await waitFor(() => {
      expect(screen.queryByText('Assumes no implants')).not.toBeInTheDocument();
    });
  });

  it('hides the note under What-If None — a deliberate choice, not a permission gap', async () => {
    await seedGrant(1, []);
    const user = userEvent.setup();
    renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);
    await openAssumptions(user);
    await chooseWhatIf(user, 'None');

    await waitFor(() => {
      expect(screen.queryByText('Assumes no implants')).not.toBeInTheDocument();
    });
  });
});

describe('PlanEditor booster market link (issue #407)', () => {
  it('links to Market, scoped to the cerebral accelerators group', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);
    await openAssumptions(user);

    await user.click(screen.getByRole('link', { name: 'View cerebral accelerators in Market' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/market/browser?group=2487');
  });
});

const seedAccelerator = (bonus: number, expiresAt: number) =>
  db.characterAccelerators.put({
    id: '1',
    characterId: 1,
    bonus,
    expiresAt,
    updatedAt: 1,
  });

describe('a cerebral accelerator detected in the ESI sheet', () => {
  const ACCELERATED = {
    kind: 'accelerated' as const,
    acceleratorBonus: 12,
    attributes: { intelligence: 17, memory: 26, perception: 22, willpower: 17, charisma: 17 },
  };

  it('shows the detected bonus as a fact and says where it came from', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);
    await openAssumptions(user);

    expect(screen.getByText('+12 detected')).toBeInTheDocument();
    expect(screen.queryByText('+12')).toBeNull();
    expect(screen.queryByLabelText('Bonus')).toBeNull();
  });

  it('leaves the expiry blank and warns that nothing is applied until it is set', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);
    await openAssumptions(user);

    expect(screen.getByLabelText<HTMLInputElement>('Days').value).toBe('');
    expect(screen.getByText(/count it in training times/i)).toBeInTheDocument();
  });

  it('shows whatever tier was detected, not a fixed number', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      attributeBaseline: { ...ACCELERATED, acceleratorBonus: 4 },
    });
    await openTools(user);
    await openAssumptions(user);

    expect(screen.getByText('+4 detected')).toBeInTheDocument();
  });

  it('saves the detected bonus with the time the pilot sets', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);
    await openAssumptions(user);

    await user.type(screen.getByLabelText('Hours'), '12');

    await waitFor(async () => expect((await db.characterAccelerators.get('1'))?.bonus).toBe(12));
  });

  it('still applies the accelerator once an expiry is given', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { attributeBaseline: ACCELERATED });
    await openTools(user);
    await openAssumptions(user);

    await user.type(screen.getByLabelText('Days'), '5');

    await waitFor(() => expect(screen.queryByText(/count it in training times/i)).toBeNull());
  });
});

describe('PlanEditor persists the lenses the plan is costed under', () => {
  it('saves a What-If Implants preset onto the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);
    await openAssumptions(user);

    await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
    await user.click(await screen.findByRole('option', { name: '+4' }));

    expect(onUpdate).toHaveBeenCalledWith({ whatIfImplants: { kind: 'preset', preset: '+4' } });
  });

  it('saves a per-slot What-If set onto the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { implants: FITTED });
    await openTools(user);
    await openAssumptions(user);
    await chooseWhatIf(user, 'Custom');

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
    await openAssumptions(user);

    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('+5');
    expect(screen.getByText('INT +5 · MEM +5 · PER +5 · WIL +5 · CHA +5')).toBeInTheDocument();
  });

  it('opens an Accelerator editor from "Add accelerator" without touching the plan', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();
    await openTools(user);
    await openAssumptions(user);

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));

    expect(screen.getByLabelText('Days')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('stores the time left as the instant that long from now, not as the typed text', async () => {
    const user = userEvent.setup();
    renderEditor();
    await openTools(user);
    await openAssumptions(user);

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    const before = Date.now();
    await user.type(screen.getByLabelText('Days'), '3');

    await waitFor(async () => {
      const saved = await db.characterAccelerators.get('1');
      expect(saved?.expiresAt).toBeGreaterThanOrEqual(before + 3 * DAY_MS);
    });
    const saved = await db.characterAccelerators.get('1');
    expect(saved?.expiresAt).toBeLessThan(before + 3 * DAY_MS + 10_000);
  });

  it('reopens on the Accelerator the Character was saved with', async () => {
    const user = userEvent.setup();
    await seedAccelerator(6, Date.now() + 2 * DAY_MS + 5 * 60 * 60 * 1000 + 30 * 60 * 1000);
    renderEditor();
    await openTools(user);
    await openAssumptions(user);

    expect(await screen.findByRole('button', { name: /^Edit bonus/ })).toHaveTextContent('6');
    expect(screen.getByRole('button', { name: /^Edit time left/ })).toHaveTextContent(
      /2d 5h \d+m$/
    );
  });

  it('does not erase a saved expiry when a box is cleared to be retyped', async () => {
    const user = userEvent.setup();
    await seedAccelerator(3, Date.now() + 5 * DAY_MS);
    renderEditor();
    await openTools(user);
    await openAssumptions(user);
    await user.click(await screen.findByRole('button', { name: /^Edit time left/ }));

    const days = await screen.findByLabelText<HTMLInputElement>('Days');
    await user.clear(days);

    expect(days.value).toBe('');
    expect(await db.characterAccelerators.get('1')).toBeDefined();
  });

  it('forgets the accelerator when every time box is emptied and focus leaves', async () => {
    const user = userEvent.setup();
    await seedAccelerator(3, Date.now() + 5 * DAY_MS);
    renderEditor();
    await openTools(user);
    await openAssumptions(user);
    await user.click(await screen.findByRole('button', { name: /^Edit time left/ }));

    await user.clear(await screen.findByLabelText('Days'));
    await user.clear(screen.getByLabelText('Hours'));
    await user.clear(screen.getByLabelText('Minutes'));
    await user.tab();

    await waitFor(async () => expect(await db.characterAccelerators.get('1')).toBeUndefined());
  });

  it('replaces a saved expiry in one write, never through an expiry of zero in between', async () => {
    const user = userEvent.setup();
    await seedAccelerator(3, Date.now() + 5 * DAY_MS);
    renderEditor();
    await openTools(user);
    await openAssumptions(user);
    await user.click(await screen.findByRole('button', { name: /^Edit time left/ }));

    const days = await screen.findByLabelText<HTMLInputElement>('Days');
    await user.clear(days);
    await user.type(days, '4');
    await user.tab();

    await waitFor(async () => {
      const saved = await db.characterAccelerators.get('1');
      expect(saved?.expiresAt).toBeGreaterThan(Date.now() + 4 * DAY_MS - 10_000);
    });
    const saved = await db.characterAccelerators.get('1');
    expect(saved?.expiresAt).toBeLessThan(Date.now() + 4 * DAY_MS + 10_000);
    expect(await db.characterAccelerators.count()).toBe(1);
  });

  it('clamps the bonus where it is written', async () => {
    const user = userEvent.setup();
    await seedAccelerator(3, Date.now() + 5 * DAY_MS);
    renderEditor();
    await openTools(user);
    await openAssumptions(user);

    await user.click(await screen.findByRole('button', { name: /^Edit bonus/ }));
    const bonus = await screen.findByLabelText('Bonus');
    await user.clear(bonus);
    await user.type(bonus, '45');

    await waitFor(async () => expect((await db.characterAccelerators.get('1'))?.bonus).toBe(30));
  });
});

describe('a character with no accelerator', () => {
  it.each([
    ['a legal sheet', { kind: 'legal' as const, attributes: ATTRIBUTES }],
    ['ESI not read yet', null],
    ['no baseline passed at all', undefined],
  ])('says nothing and changes nothing for %s', async (_label, attributeBaseline) => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), attributeBaseline === undefined ? {} : { attributeBaseline });
    await openTools(user);
    await openAssumptions(user);

    expect(screen.getByRole('button', { name: 'Add accelerator' })).toBeInTheDocument();
    expect(screen.queryByText(/cerebral accelerator/i)).toBeNull();
    expect(screen.queryByText(/count it in training times/i)).toBeNull();
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
    await openAssumptions(user);

    expect(screen.getByText(/attributes look wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy debug info' })).toBeInTheDocument();
  });
});

describe('splitting a plan into one row per level', () => {
  const MULTI_LEVEL = { ...PLAN, entries: [{ skillTypeID: 10, targetLevel: 3 }], markers: [1] };

  it('writes the split on open once the trained levels are known', async () => {
    const { onUpdate } = renderEditor(vi.fn(), { plan: MULTI_LEVEL });

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
  });

  it("rewrites nothing until the character's trained levels are actually known", async () => {
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: MULTI_LEVEL,
      trainedSkillsKnown: false,
    });

    expect(await screen.findByText('Your entries')).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('removing an entry (undo toast, no confirmation)', () => {
  it('removes the entry at once and Undo restores the previous entries', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('button', { name: /more actions for skill a/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove skill a/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [{ skillTypeID: 20, targetLevel: 1, priority: 'high' }] })
    );
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ entries: PLAN.entries }));
  });

  it("removing entry 1 of 2 moves focus to the next row's reorder button (WCAG 2.4.3)", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: /more actions for skill a/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove skill a/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reorder skill b/i })).toHaveFocus()
    );
  });

  it('removing the only entry moves focus to the "Your entries" heading', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), {
      plan: { ...PLAN, entries: [{ skillTypeID: 10, targetLevel: 1 }] },
    });

    await user.click(screen.getByRole('button', { name: /more actions for skill a/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove skill a/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your entries' })).toHaveFocus()
    );
  });

  it("Saving a milestone gives focus back to the row's ⋮ (WCAG 2.4.3)", async () => {
    const user = userEvent.setup();
    renderEditor();

    const more = screen.getByRole('button', { name: /more actions for skill a i/i });
    await user.click(more);
    await user.click(await screen.findByRole('menuitem', { name: 'Add milestone' }));
    const dialog = screen.getByRole('dialog', { name: 'Name this milestone' });
    await user.type(within(dialog).getByRole('textbox'), 'Fly Loki');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(more).toHaveFocus();
  });
});

describe('yearly remap on cooldown (#1404)', () => {
  it('shows the savings badge for a plan whose only remap is the on-cooldown yearly one', () => {
    const remapInfo: RemapAvailability = {
      available: 0,
      bonus: 0,
      yearlyReady: false,
      cooldownUntil: new Date(Date.now() + 1000),
    };
    renderEditor(vi.fn(), { plan: { ...PLAN, remapCount: 0 }, remapInfo });

    expect(screen.getByText('Remap savings')).toBeInTheDocument();
  });
});

describe('derived remap budget summary, no manual override (#1412)', () => {
  it('shows the live EVE count when the yearly remap is ready, ignoring a stale plan.remapCount', async () => {
    const user = userEvent.setup();
    const remapInfo: RemapAvailability = {
      available: 2,
      bonus: 1,
      yearlyReady: true,
      cooldownUntil: null,
    };
    renderEditor(vi.fn(), { plan: { ...PLAN, remapCount: 5 }, remapInfo });
    await openTools(user);

    expect(screen.getByText('Remaps: 1 bonus · yearly remap ready')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /remap/i })).toBeNull();
  });

  it('shows the cooldown date when the yearly remap is not ready yet', async () => {
    const user = userEvent.setup();
    const remapInfo: RemapAvailability = {
      available: 1,
      bonus: 1,
      yearlyReady: false,
      cooldownUntil: new Date('2027-03-12T00:00:00Z'),
    };
    renderEditor(vi.fn(), { plan: { ...PLAN, remapCount: 5 }, remapInfo });
    await openTools(user);

    expect(screen.getByText(/^Remaps: 1 bonus · yearly remap from /)).toBeInTheDocument();
  });
});

describe('queue import into a non-empty plan asks Append or Replace (#1402)', () => {
  beforeEach(() => {
    loadCharacterSkillQueue.mockReset();
  });

  it('imports straight in, with no Modal, when the plan is empty', async () => {
    loadCharacterSkillQueue.mockResolvedValue(
      queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }])
    );
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, entries: [] } });

    await importFromQueue(user);

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({ entries: [{ skillTypeID: 20, targetLevel: 3 }] })
    );
    expect(screen.queryByText('Append')).not.toBeInTheDocument();
  });

  it('opens the choice Modal instead of changing anything, for a non-empty plan', async () => {
    loadCharacterSkillQueue.mockResolvedValue(
      queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }])
    );
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await importFromQueue(user);

    expect(await screen.findByText(/in-game queue has 1 skill/i)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('Append keeps every existing entry and adds only the new level', async () => {
    loadCharacterSkillQueue.mockResolvedValue(
      queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }])
    );
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await importFromQueue(user);
    await screen.findByText(/in-game queue has 1 skill/i);
    await user.click(screen.getByRole('button', { name: 'Append' }));

    expect(onUpdate).toHaveBeenCalledWith({
      entries: [
        { skillTypeID: 10, targetLevel: 1 },
        { skillTypeID: 20, targetLevel: 1, priority: 'high' },
        { skillTypeID: 20, targetLevel: 3 },
      ],
    });
  });

  it('Replace swaps the entries in', async () => {
    loadCharacterSkillQueue.mockResolvedValue(
      queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }])
    );
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), { plan: { ...PLAN, markers: [1] } });

    await importFromQueue(user);
    await screen.findByText(/in-game queue has 1 skill/i);
    await user.click(screen.getByRole('button', { name: 'Replace plan' }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [{ skillTypeID: 20, targetLevel: 3 }] })
    );
  });

  it('Undo writes back the snapshot taken before the Replace', async () => {
    loadCharacterSkillQueue.mockResolvedValue(
      queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }])
    );
    const user = userEvent.setup();
    const originalPlan = { ...PLAN, markers: [1] };
    const { onUpdate } = renderEditor(vi.fn(), { plan: originalPlan });

    await importFromQueue(user);
    await screen.findByText(/in-game queue has 1 skill/i);
    await user.click(screen.getByRole('button', { name: 'Replace plan' }));

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ entries: originalPlan.entries })
    );
  });

  it('an empty queue never replaces or empties the plan', async () => {
    loadCharacterSkillQueue.mockResolvedValue(queueResult([]));
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await importFromQueue(user);

    expect(await screen.findByText(/in-game skill queue is empty/i)).toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('a later Append clears a stale Undo from an earlier Replace', async () => {
    loadCharacterSkillQueue
      .mockResolvedValueOnce(queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }]))
      .mockResolvedValueOnce(queueResult([{ skill_id: 20, finished_level: 4, queue_position: 0 }]));
    const user = userEvent.setup();
    renderEditor();

    await importFromQueue(user);
    await screen.findByText(/in-game queue has 1 skill/i);
    await user.click(screen.getByRole('button', { name: 'Replace plan' }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    await importFromQueue(user);
    await screen.findByText(/in-game queue has 1 skill/i);
    await user.click(screen.getByRole('button', { name: 'Append' }));

    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('disables the Import button while a fetch is already in flight', async () => {
    let resolveQueue: (value: CachedResult<SkillQueueEntry[]>) => void = () => {};
    loadCharacterSkillQueue.mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      })
    );
    const user = userEvent.setup();
    renderEditor();

    const importButton = screen.getByRole('button', { name: 'Import' });
    await importFromQueue(user);
    expect(importButton).toHaveAttribute('aria-disabled', 'true');

    resolveQueue(queueResult([]));
    await waitFor(() => expect(importButton).not.toBeDisabled());
  });

  it('drops a fetch that resolves after the user has switched to a different plan', async () => {
    let resolveQueue: (value: CachedResult<SkillQueueEntry[]>) => void = () => {};
    loadCharacterSkillQueue.mockReturnValue(
      new Promise((resolve) => {
        resolveQueue = resolve;
      })
    );
    const user = userEvent.setup();
    const { onUpdate, replacePlan } = renderEditor();

    await importFromQueue(user);

    replacePlan(() => ({ ...PLAN, id: 'plan-2' }));
    onUpdate.mockClear();

    await act(async () => {
      resolveQueue(queueResult([{ skill_id: 20, finished_level: 3, queue_position: 0 }]));
      await Promise.resolve();
    });

    expect(screen.queryByText(/in-game queue has/i)).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('Clone State (#1233)', () => {
  it('flags every level above the Alpha skill cap once the Character is set to Alpha', async () => {
    const user = userEvent.setup();
    renderEditor(vi.fn(), { characterId: 1233 });
    await openTools(user);
    await openAssumptions(user);

    const toggle = screen.getByLabelText<HTMLInputElement>('Alpha clone');
    expect(toggle.checked).toBe(false);
    expect(screen.queryAllByRole('img', { name: 'Above the Alpha skill cap' })).toHaveLength(0);

    await user.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(screen.getAllByRole('img', { name: 'Above the Alpha skill cap' })).toHaveLength(2);
    expect(
      screen.getByText('2 levels in this plan are above the Alpha skill cap.')
    ).toBeInTheDocument();
  });
});

describe('Plan Milestones (GLOSSARY.md)', () => {
  it("names a goal from a row, and shows it as the header's next milestone", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor();

    await user.click(screen.getByRole('button', { name: /more actions for skill a i/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add milestone' }));
    const dialog = screen.getByRole('dialog', { name: 'Name this milestone' });
    await user.type(within(dialog).getByRole('textbox'), 'Fly Loki');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith({
      milestones: [expect.objectContaining({ name: 'Fly Loki', skillTypeID: 10, level: 1 })],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByText('Fly Loki').length).toBeGreaterThan(0);
  });

  it('renames an existing milestone from the row menu', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: {
        ...PLAN,
        milestones: [{ id: 'm1', name: 'Fly Loki', skillTypeID: 10, level: 1 }],
      },
    });

    await user.click(screen.getByRole('button', { name: /more actions for skill a i/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename milestone' });
    const input = within(dialog).getByRole('textbox');
    expect(input).toHaveValue('Fly Loki');
    await user.clear(input);
    await user.type(input, 'Command Ships');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(onUpdate).toHaveBeenCalledWith({
      milestones: [{ id: 'm1', name: 'Command Ships', skillTypeID: 10, level: 1 }],
    });
  });

  it('removes a milestone from the row menu', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: {
        ...PLAN,
        milestones: [{ id: 'm1', name: 'Fly Loki', skillTypeID: 10, level: 1 }],
      },
    });

    await user.click(screen.getByRole('button', { name: /more actions for skill a i/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove milestone' }));

    expect(onUpdate).toHaveBeenCalledWith({ milestones: [] });
  });

  it('surfaces an orphaned milestone under the header once its entry is removed, with a remove action', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderEditor(vi.fn(), {
      plan: {
        ...PLAN,
        milestones: [{ id: 'm1', name: 'Fly Loki', skillTypeID: 10, level: 1 }],
      },
    });

    await user.click(screen.getByRole('button', { name: /more actions for skill a i/i }));
    await user.click(await screen.findByRole('menuitem', { name: /remove skill a i/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [{ skillTypeID: 20, targetLevel: 1, priority: 'high' }],
      })
    );
    expect(screen.getByText(/Fly Loki.*entry removed/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove milestone fly loki/i }));
    expect(onUpdate).toHaveBeenLastCalledWith({ milestones: [] });
  });
});
