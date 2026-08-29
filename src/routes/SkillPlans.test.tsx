import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type SkillPlanRecord } from '@/db';
import { configureClipboard, type ClipboardWriter } from '@/features/skills/clipboard';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import type { SkillType } from '@/sde/types';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// Small hand-made fixture, not the real SDE: a prereq chain (Small Hybrid
// Turret needs Gunnery III) plus a second attribute pair (Spaceship Command)
// and a same-pair-as-Gunnery skill (Small Projectile Turret) to exercise
// prereq insertion, remap segmentation, and reorder-by-attribute-pair.
const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 1,
    name: 'Gunnery',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  {
    typeID: 2,
    name: 'Small Hybrid Turret',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [{ skillTypeID: 1, level: 3 }],
  },
  {
    typeID: 3,
    name: 'Spaceship Command',
    groupID: 20,
    groupName: 'Spaceship Command',
    rank: 1,
    primaryAttr: 'intelligence',
    secondaryAttr: 'memory',
    prereqs: [],
  },
  {
    typeID: 4,
    name: 'Small Projectile Turret',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const attributesPayload = {
  charisma: 19,
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
};
const emptySkillsPayload = { skills: [], total_sp: 0, unallocated_sp: 0 };

const server = setupServer(
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json(emptySkillsPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
    HttpResponse.json(attributesPayload)
  ),
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
    HttpResponse.json([
      { skill_id: 1, queue_position: 0, finished_level: 3 },
      { skill_id: 3, queue_position: 1, finished_level: 1 },
    ])
  )
);

function seedPlan(overrides: Partial<SkillPlanRecord> = {}): SkillPlanRecord {
  return {
    id: 'plan-1',
    characterId: CHAR_ID,
    name: 'Test plan',
    entries: [],
    remapCount: 0,
    updatedAt: 1,
    ...overrides,
  };
}

let clipboardWriteText: ReturnType<typeof vi.fn<ClipboardWriter>>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  configureClipboard(null);
});
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.skillPlans.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });

  clipboardWriteText = vi.fn<ClipboardWriter>().mockResolvedValue(undefined);
  configureClipboard(clipboardWriteText);
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  window.history.pushState({}, '', '/skills/plans');
});

describe('SkillPlans CRUD', () => {
  it('creates, renames, duplicates, and deletes a plan, persisted in Dexie', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    expect(await screen.findByText('Untitled plan')).toBeInTheDocument();
    const stored = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(stored).toHaveLength(1);
    const planId = stored[0].id;

    await user.click(screen.getByRole('button', { name: 'Rename Untitled plan' }));
    const input = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(input);
    await user.type(input, 'PvP Fit{Enter}');
    expect(await screen.findByText('PvP Fit')).toBeInTheDocument();
    expect((await db.skillPlans.get(planId))?.name).toBe('PvP Fit');

    const row = screen.getByText('PvP Fit').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByText('PvP Fit (copy)')).toBeInTheDocument();
    expect(await db.skillPlans.where('characterId').equals(CHAR_ID).count()).toBe(2);

    const originalRow = screen.getByText('PvP Fit').closest('li')!;
    await user.click(within(originalRow).getByRole('button', { name: 'Delete' }));
    const remaining = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('PvP Fit (copy)');
    expect(window.confirm).toHaveBeenCalled();
  });
});

describe('SkillPlans editor: add-skill picker', () => {
  it('inserts prerequisites into the computed queue, dimmed, ahead of the user entry', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    const search = await screen.findByRole('textbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));
    await user.click(await screen.findByRole('button', { name: 'Level I' }));

    const panel = screen.getByText('Computed queue').closest('section')!;
    const items = within(panel).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery I'),
      expect.stringContaining('Gunnery II'),
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Small Hybrid Turret I'),
    ]);
    expect(items[0].textContent).toMatch(/prereq/i);
    expect(items[3].textContent).not.toMatch(/prereq/i);

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
  });
});

describe('SkillPlans editor: import / export', () => {
  it('imports the in-game skill queue (deduped) and exports the computed queue to the clipboard', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from skill queue' }));
    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    expect(await within(entriesPanel).findByText('Gunnery')).toBeInTheDocument();
    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);

    await user.click(screen.getByRole('button', { name: 'Export to clipboard' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'Gunnery I\nGunnery II\nGunnery III\nSpaceship Command I'
    );
  });
});

describe('SkillPlans editor: optimize remaps', () => {
  it('renders remap segments with attribute spreads and timing', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 1,
      })
    );
    render(<App />);

    await screen.findByText('Computed queue');
    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    expect(await screen.findByRole('heading', { name: 'Optimize remaps' })).toBeInTheDocument();
    expect(screen.getByText(/Segment 1/)).toBeInTheDocument();
    expect(screen.getByText(/Total time/)).toBeInTheDocument();
    expect(screen.getByText(/Savings/)).toBeInTheDocument();
  });
});

describe('SkillPlans editor: suggest reorder', () => {
  it('previews a grouped reorder and, on accept, rewrites and persists entry order', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 }, // Gunnery (perception/willpower)
          { skillTypeID: 3, targetLevel: 1 }, // Spaceship Command (intelligence/memory)
          { skillTypeID: 4, targetLevel: 1 }, // Small Projectile Turret (perception/willpower)
        ],
      })
    );
    render(<App />);

    await screen.findByText('Computed queue');
    await user.click(screen.getByRole('button', { name: 'Suggest reorder' }));

    expect(await screen.findByRole('heading', { name: 'Suggested reorder' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 4, targetLevel: 1 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);
  });
});

describe('SkillPlans: current skill queue panel', () => {
  it('shows the in-game skill queue with training times, separate from any plan', async () => {
    render(<App />);

    const panel = (await screen.findByText('Current skill queue')).closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Spaceship Command I'),
    ]);
  });
});
