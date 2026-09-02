import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db, type SkillPlanRecord } from '@/db';
import { configureClipboard, type ClipboardWriter } from '@/lib/clipboard';
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

// Real src/sync would attempt actual Firebase network calls (this repo's
// .env carries a real dev project config). markPlanDeleted is faked down to
// its local-delete effect only — the tombstone/remote bookkeeping is src/sync's
// own responsibility and is covered by its own test suite.
const markPlanDeletedMock = vi.fn(async (_characterId: number, id: string) => {
  await db.skillPlans.delete(id);
});
const scheduleSyncMock = vi.fn();
const triggerSyncMock = vi
  .fn<(characterId: number) => Promise<void>>()
  .mockResolvedValue(undefined);
const subscribeSyncStatusMock = vi.fn((listener: (s: unknown) => void) => {
  listener({ state: 'idle', lastSyncedAt: null, error: null });
  return () => {};
});
vi.mock('@/sync', () => ({
  markPlanDeleted: (characterId: number, id: string) => markPlanDeletedMock(characterId, id),
  scheduleSync: (characterId: number) => scheduleSyncMock(characterId),
  triggerSync: (characterId: number) => triggerSyncMock(characterId),
  subscribeSyncStatus: (listener: (s: unknown) => void) => subscribeSyncStatusMock(listener),
}));

// isSyncConfigured reads import.meta.env, which is 'test' MODE in this suite
// and would otherwise disable the scheduleSync-after-edit wiring under test.
// Force it on so that wiring is exercised (against the mocked src/sync above,
// never real Firebase).
vi.mock('@/app/syncStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/syncStatus')>()),
  isSyncConfigured: () => true,
}));

// Small hand-made fixture, not the real SDE: a prereq chain (Small Hybrid
// Turret needs Gunnery III) plus a second attribute pair (Spaceship Command)
// and a same-pair-as-Gunnery skill (Small Projectile Turret) to exercise
// prereq insertion, remap segmentation, and reorder-by-attribute-pair.
const FIXTURE_SKILLS: SkillType[] = [
  {
    typeID: 1,
    name: 'Gunnery',
    description: '',
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
    description: '',
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
    description: '',
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
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
];

const RIFTER_TYPE_ID = 587;
const FIXTURE_TYPES = {
  [RIFTER_TYPE_ID]: { name: 'Rifter', groupID: 25, volume: 27_000 },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => FIXTURE_SKILLS),
  loadTypes: vi.fn(async () => FIXTURE_TYPES),
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
  ),
  // Loaded alongside attributes for the What-If Implants lens (PlanEditor);
  // no test in this file exercises real implant bonuses, so no implants.
  http.get(`https://esi.evetech.net/characters/${CHAR_ID}/implants`, () => HttpResponse.json([])),
  http.get(`https://esi.evetech.net/universe/types/${RIFTER_TYPE_ID}`, () =>
    HttpResponse.json({
      type_id: RIFTER_TYPE_ID,
      name: 'Rifter',
      description: '',
      group_id: 25,
      published: true,
      dogma_attributes: [
        { attribute_id: 182, value: 1.0 }, // requires Gunnery (typeID 1)...
        { attribute_id: 277, value: 3.0 }, // ...level III
      ],
    })
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

/** Most editor-focused tests below seed a single plan and want its editor
 * page open immediately, rather than exercising the list-click navigation
 * that `SkillPlans CRUD` already covers. */
function goToPlanEditor(id = 'plan-1') {
  window.history.pushState({}, '', `/skills/plans/${id}`);
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

  markPlanDeletedMock.mockClear();
  scheduleSyncMock.mockClear();
  triggerSyncMock.mockClear();
  subscribeSyncStatusMock.mockClear().mockImplementation((listener: (s: unknown) => void) => {
    listener({ state: 'idle', lastSyncedAt: null, error: null });
    return () => {};
  });

  window.history.pushState({}, '', '/skills/plans');
});

describe('SkillPlans CRUD', () => {
  it('creates a plan and navigates straight to its editor, scheduling a sync', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'New plan' }));

    const stored = await waitFor(async () => {
      const all = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(all).toHaveLength(1);
      return all;
    });
    await waitFor(() => expect(window.location.pathname).toBe(`/skills/plans/${stored[0].id}`));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it('renames a plan from the list, scheduling a sync', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Rename Test plan' }));
    const input = screen.getByRole('textbox', { name: 'Rename' });
    await user.clear(input);
    await user.type(input, 'PvP Fit{Enter}');

    expect(await screen.findByText('PvP Fit')).toBeInTheDocument();
    expect((await db.skillPlans.get('plan-1'))?.name).toBe('PvP Fit');
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it('duplicates a plan from the list and navigates to the copy’s editor, scheduling a sync', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Duplicate Test plan' }));

    const copy = await waitFor(async () => {
      const all = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      const found = all.find((p) => p.name === 'Test plan (copy)');
      expect(found).toBeDefined();
      return found!;
    });
    await waitFor(() => expect(window.location.pathname).toBe(`/skills/plans/${copy.id}`));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it('deletes a plan via the confirmation Modal, not window.confirm', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete Test plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(async () =>
      expect(await db.skillPlans.where('characterId').equals(CHAR_ID).count()).toBe(0)
    );
    // Deletes MUST go through markPlanDeleted (records a tombstone) — a plain
    // Dexie delete would let the remote copy resurrect it on next sync.
    expect(markPlanDeletedMock).toHaveBeenCalledWith(CHAR_ID, 'plan-1');
  });

  it('cancels a delete from the confirmation Modal without deleting', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Delete Test plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(markPlanDeletedMock).not.toHaveBeenCalled();
  });

  it('returns to the list via the back link, and via the browser’s own Back after opening a plan', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    await user.click(await screen.findByText('Test plan'));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/plans/plan-1');

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    expect(await screen.findByText('Skill Plans')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/plans');

    await user.click(await screen.findByText('Test plan'));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/skills/plans'));
    expect(await screen.findByText('Skill Plans')).toBeInTheDocument();
  });
});

describe('SkillPlans layout: side by side list + editor (#158)', () => {
  it('shows one column at a time on narrow screens, with a back control that returns to the list', async () => {
    // jsdom's default `window.matchMedia` (vitest.setup.ts) never matches,
    // so this already runs as a narrow viewport.
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    render(<App />);

    const listPanel = (await screen.findByText('New plan')).closest('section');
    const detailPanel = (await screen.findByText('Select a plan, or create one.')).closest(
      'section'
    );
    expect(listPanel).not.toHaveClass('hidden');
    expect(detailPanel).toHaveClass('hidden');
    expect(screen.queryByRole('link', { name: 'Back to plans' })).not.toBeInTheDocument();

    await user.click(await screen.findByText('Test plan'));
    await screen.findByText('Your entries');

    // The list pane is still rendered (CSS-hidden, not unmounted) behind
    // the editor on narrow screens, matching Market's narrow-screen
    // precedent — the same `hidden`-toggle approach, not literal DOM removal.
    const listPanelOnEditor = screen.getByText('Test plan').closest('section');
    expect(listPanelOnEditor).toHaveClass('hidden');
    expect(await screen.findByRole('link', { name: 'Back to plans' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));

    expect(await screen.findByText('Select a plan, or create one.')).toBeInTheDocument();
    const listPanelBack = screen.getByText('New plan').closest('section');
    expect(listPanelBack).not.toHaveClass('hidden');
  });

  it('keeps both panes visible on desktop, with no back control', async () => {
    const original = window.matchMedia;
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
      const user = userEvent.setup();
      await db.skillPlans.add(seedPlan());
      render(<App />);

      await user.click(await screen.findByText('Test plan'));
      await screen.findByText('Your entries');

      const listPanel = screen.getByText('Test plan').closest('section');
      expect(listPanel).not.toHaveClass('hidden');
      expect(screen.queryByRole('link', { name: 'Back to plans' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('SkillPlans: sync error visibility (UX-REVIEW #10)', () => {
  it('shows a visible "Sync error" note (not tooltip-only) when sync is in the error state', async () => {
    subscribeSyncStatusMock.mockImplementation((listener: (s: unknown) => void) => {
      listener({ state: 'error', lastSyncedAt: null, error: 'boom' });
      return () => {};
    });
    render(<App />);
    expect(await screen.findByText('Sync error — changes saved locally')).toBeInTheDocument();
  });

  it('shows nothing extra when sync is idle', async () => {
    render(<App />);
    await screen.findByText('Current skill queue');
    expect(screen.queryByText(/sync error/i)).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: add-skill picker', () => {
  it('inserts prerequisites into the computed queue, dimmed, ahead of the user entry', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    // Column headers (checked below) only render at desktop widths (#114) —
    // jsdom's matchMedia never matches by default, so mock it to desktop.
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
      render(<App />);

      const search = await screen.findByRole('textbox', { name: 'Add skill' });
      await user.type(search, 'Small Hybrid Turret');
      await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));
      await user.click(await screen.findByRole('button', { name: 'Level I' }));

      const panel = screen.getByText('Your entries').closest('section')!;
      const items = await within(panel).findAllByRole('listitem');
      // A priority-band divider ("Normal priority") precedes the whole entry
      // block (#27) — including its leading dimmed prereq rows, not just the
      // entry row itself, so the group reads as one visual unit.
      expect(items.map((li) => li.textContent)).toEqual([
        expect.stringContaining('Normal priority'),
        expect.stringContaining('Gunnery I'),
        expect.stringContaining('Gunnery II'),
        expect.stringContaining('Gunnery III'),
        expect.stringContaining('Small Hybrid Turret I'),
      ]);
      // The three Gunnery levels are prereqs the user didn't add directly —
      // dimmed and tagged, positioned ahead of the one row for the entry
      // they were needed by (#112: entry rows are one-per-entry, not
      // one-per-level, so Small Hybrid Turret I is a single row here).
      expect(items[1].textContent).toMatch(/prereq/i);
      expect(items[2].textContent).toMatch(/prereq/i);
      expect(items[3].textContent).toMatch(/prereq/i);
      expect(items[4].textContent).not.toMatch(/prereq/i);

      // Column headers label the two time columns (UX-REVIEW #9).
      expect(within(panel).getByText('Per-level')).toBeInTheDocument();
      expect(within(panel).getByText('Cumulative')).toBeInTheDocument();
    } finally {
      window.matchMedia = realMatchMedia;
    }

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it("shows the expanded skill's prerequisites (untrained) and unlocks inline (#18)", async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const search = await screen.findByRole('textbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));

    // Small Hybrid Turret needs Gunnery III; this character has 0 SP (emptySkillsPayload).
    const prereqsHeading = await screen.findByText('Prerequisites');
    const prereqsSection = prereqsHeading.closest('section')!;
    expect(within(prereqsSection).getByText('Gunnery')).toBeInTheDocument();
    expect(within(prereqsSection).getByText('Level 3')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Gunnery');
    await user.click(await screen.findByRole('button', { name: /^Gunnery/ }));

    const unlocksHeading = await screen.findByText('Unlocks');
    const unlocksSection = unlocksHeading.closest('section')!;
    expect(within(unlocksSection).getByText('Small Hybrid Turret')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: computed queue honesty (UX-REVIEW #9)', () => {
  it('says no entries yet when the plan is empty', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(within(panel).getByText('No entries yet. Add a skill below.')).toBeInTheDocument();
  });

  // #112: the merged list no longer shows a banner distinguishing "all
  // trained" from any other populated state — with entries present it just
  // renders their rows, with 0m durations when nothing is left to train.
  // The equivalent honesty check is: the entry row is there (not the
  // empty-state banner), and its duration reads zero.
  it('renders the entry row with a zero duration, not the empty-entries banner, when every entry is already trained', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(within(panel).queryByText('No entries yet. Add a skill below.')).not.toBeInTheDocument();
    // A priority-band divider ("Normal priority") precedes the entry row
    // (#27). Waits for the row's own duration to actually settle at zero
    // (post the async ESI "already trained" skills fetch) rather than just
    // for some listitem to exist, which could be a transient pre-recompute state.
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[1].textContent).toContain('Gunnery III');
      // Exact-match: a span reading precisely "0m" only happens at zero
      // duration (any real duration formats to something like "2h 5m") —
      // the row's per-level and cumulative columns both read zero.
      expect(within(items[1]).getAllByText('0m')).toHaveLength(2);
    });
  });
});

describe('SkillPlans: /skills is stale until the character logs in', () => {
  it('counts a level the queue finished in the past as trained, though /skills omits it', async () => {
    // ESI: entries "that are in the past need to be applied on top of this
    // list". Without that, the plan is computed against levels already passed.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 1,
            queue_position: 0,
            finished_level: 3,
            start_date: '2026-01-01T00:00:00Z',
            finish_date: '2026-01-05T00:00:00Z',
          },
        ])
      )
    );
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    // A priority-band divider ("Normal priority") precedes the entry row
    // (#27). Waits for the row's own duration to actually settle at zero
    // (post the async ESI skillqueue fetch) rather than just for some
    // listitem to exist, which could be a transient pre-recompute state.
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(within(items[1]).getAllByText('0m')).toHaveLength(2);
    });
  });

  it('does not credit a paused queue entry, which has no finish date at all', async () => {
    // peterhaneve/evemon#40 marked skills falsely complete this way. The
    // default handler's entries are dateless, i.e. paused.
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    // A priority-band divider ("Normal priority") precedes the entry row
    // (#27) — wait for the row itself before checking its duration, so a
    // pre-recompute transient (with no rows/no "0m" either way) can't pass
    // this negative assertion for the wrong reason.
    const items = await within(panel).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Not credited as trained: the entry row must show real, nonzero
    // duration rather than the "0m" it would show if wrongly treated as done.
    expect(within(items[1]).queryByText('0m')).not.toBeInTheDocument();
  });
});

describe('CurrentQueuePanel: what ESI knows that /skills does not', () => {
  const queuePanel = async () =>
    (await screen.findByText('Current skill queue')).closest('section')!;

  it('keeps a finished entry visible and tells the user to log in to apply it', async () => {
    // ESI holds completed entries until the character next logs in, and says
    // /skills is out of date until then. Hiding them would discard exactly
    // the information the queue exists to carry.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 1,
            queue_position: 0,
            finished_level: 3,
            finish_date: '2020-01-01T00:00:00Z',
          },
        ])
      )
    );
    render(<App />);

    const panel = await queuePanel();
    expect(await within(panel).findByText('Done')).toBeInTheDocument();
    expect(
      within(panel).getByText(/1 skill finished training\. Log in to EVE to apply it\./i)
    ).toBeInTheDocument();
  });

  it("shows the training skill's remaining time from ESI's finish_date", async () => {
    // CurrentQueuePanel recomputes secondsRemaining from Date.now() at render
    // time, and formatDuration floors to whole hours — a finish_date exactly
    // 2h out is right on that floor's boundary, so any wall-clock time spent
    // between here and the panel's render (a real risk under CPU contention)
    // rounds it down to "1h ...". Landing mid-hour instead gives real margin.
    const finish = new Date(Date.now() + 2 * 3600_000 + 30 * 60_000).toISOString();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          { skill_id: 1, queue_position: 0, finished_level: 3, finish_date: finish },
        ])
      )
    );
    render(<App />);

    const panel = await queuePanel();
    expect(await within(panel).findByText('Training')).toBeInTheDocument();
    expect(within(panel).getByText(/2h.*left/i)).toBeInTheDocument();
  });

  it('calls a queue with no dates paused, rather than pretending it starts now', async () => {
    // The default fixture carries no date fields — a paused queue. Inventing
    // a start time here is the EVEMon bug (peterhaneve/evemon#40).
    render(<App />);

    const panel = await queuePanel();
    // Both fixture rows are paused — the badge is per row.
    expect(await within(panel).findAllByText('Paused')).toHaveLength(2);
    expect(
      within(panel).getByText(/Training is paused, so EVE reports no completion times\./i)
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/left/i)).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: import / export', () => {
  it('imports the in-game skill queue (deduped) and exports the computed queue to the clipboard', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from skill queue' }));
    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    // The entry row's name and level render as separate text nodes ("Gunnery"
    // " " "III"), so match by regex rather than the exact string "Gunnery".
    expect(await within(entriesPanel).findByText(/Gunnery/)).toBeInTheDocument();
    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'Gunnery I\nGunnery II\nGunnery III\nSpaceship Command I'
    );
  });

  it('shows an inline error (no unhandled rejection) when the in-game queue import fails to parse (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        // Missing finished_level: parseSkillQueue throws synchronously.
        HttpResponse.json([{ skill_id: 1, queue_position: 0 }])
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from skill queue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid finished_level/);
  });
});

describe('SkillPlans editor: optimize remaps', () => {
  it('renders a savings verdict and readable remap instructions per segment', async () => {
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
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    const panel = (await screen.findByRole('heading', { name: 'Optimize remaps' })).closest(
      'section'
    )!;
    // Single verdict line (UX-REVIEW #2), not the Total/Current/Savings triple.
    expect(within(panel).getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Total time/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Current attributes/)).not.toBeInTheDocument();
    // Actionable per-segment instruction (UX-REVIEW #6): the plan is
    // perception/willpower-heavy, so the remap maxes PER.
    expect(within(panel).getByText(/Segment 1/)).toBeInTheDocument();
    expect(
      within(panel).getByText(/Before Gunnery I, remap to PER 27 \/ WIL 21 \/ /)
    ).toBeInTheDocument();
  });

  it('says no remap helps (and hides segments) when current attributes are already optimal', async () => {
    // The optimal spread for this perception/willpower-heavy plan: the
    // optimizer can only match it, so savings must be zero, never negative.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 17,
          intelligence: 17,
          memory: 17,
          perception: 27,
          willpower: 21,
        })
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }], remapCount: 2 })
    );
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));

    expect(
      await screen.findByText(
        'No remap improves this plan in its current order \u2014 keeping current attributes. Try "Suggest reorder" to group similar skills first, then optimize again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Segment 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Remapping saves/)).not.toBeInTheDocument();
  });

  it('carries an info tooltip on the Optimize remaps button explaining it evaluates the current order', async () => {
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 1,
      })
    );
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    const button = screen.getByRole('button', { name: 'Optimize remaps' });
    const tooltipId = button.getAttribute('aria-describedby');
    const tooltip = document.getElementById(tooltipId!);

    expect(tooltip).toHaveTextContent(
      'Evaluates the plan\'s entries in their current order \u2014 it never reorders them. Grouping similar skills together first (e.g. with "Suggest reorder") tends to produce bigger savings.'
    );
  });

  it('clears the stale optimize result when an entry is removed, instead of crashing on an out-of-range segment index (BUG #1)', async () => {
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
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));
    expect(await screen.findByRole('heading', { name: 'Optimize remaps' })).toBeInTheDocument();

    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    // Remove enough entries to shrink the scheduled queue below the stale
    // segment's startIndex — must not throw, and must drop the stale panel
    // rather than render against the old (now out-of-range) schedule.
    // Icon-only remove button (#112): accessible name is "Remove {skill}",
    // not visible text — entries[0] is Gunnery.
    await user.click(within(entriesPanel).getByRole('button', { name: 'Remove Gunnery' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Optimize remaps' })).not.toBeInTheDocument()
    );
    // The rest of the app must still be usable — no crash boundary tripped.
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: remap markers', () => {
  it('adds a removable marker row and persists positions in Dexie (no schema bump)', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
      })
    );
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add remap marker' }));
    expect(await screen.findByText('Remap marker')).toBeInTheDocument();
    // Appended after the last entry: position === entries.length.
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.markers).toEqual([2]));
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);

    await user.click(screen.getByRole('button', { name: 'Remove marker' }));
    await waitFor(() => expect(screen.queryByText('Remap marker')).not.toBeInTheDocument());
    expect((await db.skillPlans.get('plan-1'))?.markers).toEqual([]);
  });

  it('optimize at my markers reports the current-attributes segment and a best spread per marker segment', async () => {
    const user = userEvent.setup();
    // Marker at entry position 1: train Gunnery I..V on current attributes,
    // remap before Spaceship Command (int/mem).
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 5 },
          { skillTypeID: 3, targetLevel: 3 },
        ],
        markers: [1],
      })
    );
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    const optimizeButton = screen.getByRole('button', { name: 'Optimize at my markers' });
    expect(optimizeButton).toBeEnabled();
    await user.click(optimizeButton);

    expect(
      await screen.findByRole('heading', { name: 'Optimize at my markers' })
    ).toBeInTheDocument();
    // Verdict line, same pattern as "optimize now".
    expect(screen.getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    // Segment 1: leading current-attributes prefix, no remap spent.
    expect(screen.getByText('From Gunnery I, keep current attributes')).toBeInTheDocument();
    // Segment 2: the marker's segment gets its own best spread (int/mem-heavy).
    expect(
      screen.getByText(/Before Spaceship Command I, remap to INT 27 \/ MEM 21 \//)
    ).toBeInTheDocument();
  });

  it('disables "Optimize at my markers" when the plan has no markers', async () => {
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    expect(screen.getByRole('button', { name: 'Optimize at my markers' })).toBeDisabled();
  });
});

describe('SkillPlans editor: the remap cap is disclosed', () => {
  const optimize = async (remapCount: number) => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount,
      })
    );
    goToPlanEditor();
    render(<App />);
    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));
    await screen.findByRole('heading', { name: 'Optimize remaps' });
  };

  it('says the optimizer evaluated fewer remaps than the plan allows', async () => {
    // An answer for one remap, shown for a plan that asks for three, is the
    // silent-degradation failure this planner keeps running into.
    await optimize(3);
    expect(screen.getByText(/Evaluated with 2 remaps/i)).toBeInTheDocument();
  });

  it.each([1, 2])('says nothing when the plan asks for %i remap(s)', async (remapCount) => {
    // Two is the cap, not a capped value: the note must not fire at the
    // boundary itself.
    await optimize(remapCount);
    expect(screen.queryByText(/is not available yet/i)).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: plan header (#21)', () => {
  const seedTwoSkillPlan = (remapCount = 1) =>
    seedPlan({
      entries: [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 3, targetLevel: 1 },
      ],
      remapCount,
    });
  const header = () => screen.getByText('Plan summary').closest('section')!;

  it('shows total training time, skill count, and projected finish, plus a live savings badge', async () => {
    await db.skillPlans.add(seedTwoSkillPlan());
    goToPlanEditor();
    render(<App />);
    await screen.findByText('Your entries');

    // Skill count: distinct skills in the computed queue (Gunnery,
    // Spaceship Command), matching the same set totalSeconds times.
    expect(within(header()).getByText('2')).toBeInTheDocument();
    expect(await within(header()).findByText('Remap savings')).toBeInTheDocument();
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });

  it('omits the savings badge while a Booster is active until "Optimize remaps" supplies a real answer', async () => {
    // Booster-aware costing can take seconds of synchronous time (a Booster
    // expiring mid-plan defeats placeRemaps' aggregation) — far too slow to
    // run live in a useMemo. The header must never show a number computed
    // without the active Booster once one is on, so it shows nothing until
    // the explicit, Booster-aware "Optimize remaps" click supplies one.
    const user = userEvent.setup();
    await db.skillPlans.add(seedTwoSkillPlan());
    goToPlanEditor();
    render(<App />);
    await screen.findByText('Your entries');

    expect(await within(header()).findByText('Remap savings')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Booster' }));
    await user.type(screen.getByLabelText('Expires'), '2099-01-01T00:00');

    await waitFor(() => {
      expect(within(header()).queryByText('Remap savings')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Optimize remaps' }));
    await screen.findByRole('heading', { name: 'Optimize remaps' });

    await waitFor(() => {
      expect(within(header()).getByText('Remap savings')).toBeInTheDocument();
    });
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: remaps available from ESI', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the cooldown hint on the editor, and prefills a new plan created from the list with bonus remaps only', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          ...attributesPayload,
          bonus_remaps: 2,
          accrued_remap_cooldown_date: '2027-01-15T00:00:00Z',
        })
      )
    );
    const user = userEvent.setup();
    // Seed a plan so the editor (and its hint) is visible before creating:
    // the hint appearing proves the ESI attributes have loaded, so the "New
    // plan" that follows (from the list) is guaranteed to see the prefill value.
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    expect(
      await screen.findByText('From EVE: 2 bonus + yearly on cooldown until 2027-01-15')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    // Prefilled but user-editable: the yearly remap is on cooldown, so only
    // the 2 bonus remaps count.
    await waitFor(() => expect(screen.getByLabelText('Remaps available')).toHaveValue(2));
    const created = (await db.skillPlans.where('characterId').equals(CHAR_ID).toArray()).find(
      (p) => p.name === 'Untitled plan'
    );
    expect(created?.remapCount).toBe(2);
  });

  it('counts the yearly remap as ready when the cooldown date is past', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          ...attributesPayload,
          bonus_remaps: 1,
          accrued_remap_cooldown_date: '2026-08-29T11:00:00Z',
        })
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    expect(await screen.findByText('From EVE: 1 bonus + yearly ready')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    await waitFor(() => expect(screen.getByLabelText('Remaps available')).toHaveValue(2));
  });
});

describe('SkillPlans editor: Remaps input label (UX-REVIEW #6)', () => {
  it('labels the remap count input "Remaps available" with a helper tooltip', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
    expect(screen.getByLabelText('Remaps available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About remaps available' })).toBeInTheDocument();
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
    goToPlanEditor();
    render(<App />);

    await screen.findByText('Your entries');
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

describe('SkillPlans editor: what-if implants and booster', () => {
  it('recomputes training time when switching what-if implants mode', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
    const durationHeader = () =>
      within(queuePanel).getByText(/^\d+[dhm]/, { selector: 'header span' });
    const durationBefore = durationHeader().textContent;

    const select = screen.getByRole('combobox', { name: 'What-if implants' });
    expect(select).toHaveValue('current');
    await user.selectOptions(select, '+5');

    await waitFor(() => {
      expect(durationHeader().textContent).not.toBe(durationBefore);
    });
  });

  it('shows the bonus/expiry inputs only once the booster is enabled, and flags a past expiry as expired', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await screen.findByText('Training options');

    expect(screen.queryByLabelText('Expires')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Booster' }));
    const expiresInput = screen.getByLabelText('Expires');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    await user.type(expiresInput, '2000-01-01T00:00');
    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('an active (non-expired) booster reaches computeSchedule and changes training time', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
    const durationHeader = () =>
      within(queuePanel).getByText(/^\d+[dhm]/, { selector: 'header span' });
    const durationBefore = durationHeader().textContent;

    await user.click(screen.getByRole('checkbox', { name: 'Booster' }));
    await user.type(screen.getByLabelText('Expires'), '2099-01-01T00:00');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(durationHeader().textContent).not.toBe(durationBefore);
    });
  });
});

describe('SkillPlans editor: import from clipboard', () => {
  it('previews and applies a pasted skill plan, and reports unresolvable lines', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from clipboard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from clipboard' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III\nNot A Real Skill II');
    await user.click(within(dialog).getByRole('button', { name: 'Parse' }));

    expect(await within(dialog).findByText('Detected: skill plan')).toBeInTheDocument();
    expect(within(dialog).getByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText(/unknown skill: Not A Real Skill/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 1, targetLevel: 3 }]);
  });

  it('previews and applies a pasted EFT fit, resolving required skills from ESI dogma_attributes', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from clipboard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from clipboard' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.click(textarea);
    // user.type() treats [ ] { } as special key syntax — paste() takes the
    // literal fit text as-is instead.
    await user.paste('[Rifter, Test Fit]\n[Empty High slot]');
    await user.click(within(dialog).getByRole('button', { name: 'Parse' }));

    expect(await within(dialog).findByText('Detected: EFT fit')).toBeInTheDocument();
    // Rifter's fixture dogma requires skill typeID 1 (Gunnery) at level 3.
    expect(within(dialog).getByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).queryByText(/unknown item/i)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 1, targetLevel: 3 }]);
  });

  it('tags an already-trained skill in the preview and excludes it from the "Added N" count (UX-REVIEW #7)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from clipboard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from clipboard' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    // Gunnery III: already trained to V. Spaceship Command I: not trained.
    await user.type(textarea, 'Gunnery III\nSpaceship Command I');
    await user.click(within(dialog).getByRole('button', { name: 'Parse' }));

    expect(await within(dialog).findByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText('Already trained')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    // Both entries still get applied (existing behavior) — only the confirmation count excludes the trained one.
    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);
  });

  it('says "0 added — all trained" when every parsed entry is already trained', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Import from clipboard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from clipboard' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III');
    await user.click(within(dialog).getByRole('button', { name: 'Parse' }));
    await within(dialog).findByText('Already trained');

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('0 added — all trained')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: schedule timeline (#20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("projects a plan finish date that matches the entry row's own finish, and starts it at the plan start (#20)", async () => {
    // Gunnery I..V is a multi-day train at these attributes, so start and
    // finish land on different calendar dates. #112: this is now a single
    // aggregated entry row (Gunnery V), not five per-level rows, so its own
    // timeline line must span from the plan start to the plan finish.
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    // A priority-band divider ("Normal priority") precedes the entry row (#27).
    const items = await within(panel).findAllByRole('listitem');
    expect(items).toHaveLength(2);

    const finishNote = within(panel).getByText(/^Finishes \d{4}-\d{2}-\d{2}$/);
    const planFinishDate = finishNote.textContent!.replace('Finishes ', '');

    // The row starts exactly at the plan's wall-clock start...
    expect(items[1].textContent).toContain('2026-08-29 → ');
    // ...and its own finish is the same value the panel header projects —
    // one number, computed one way (#20 acceptance criterion).
    expect(items[1].textContent).toContain(`→ ${planFinishDate}`);
  });

  it('shows no projected finish date, and no invented start time, for an empty plan (#20)', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    await within(panel).findByText('No entries yet. Add a skill below.');
    expect(within(panel).queryByText(/^Finishes/)).not.toBeInTheDocument();
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
