import { HOUR_MS } from '@/lib/age';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { renderSkillsRoutes } from '@/test/skillsRoutes';
import { stubViewport } from '@/test/viewport';
import {
  CHAR_ID,
  emptySkillsPayload,
  server,
  seedPlan,
  goToPlanEditor,
  openPlanTools,
  openAssumptions,
  toolsSection,
  openAllPlans,
  installSkillPlansHarness,
  attributesPayload,
} from '@/test/skillPlansPage';
import { markPlanDeletedMock, scheduleSyncMock } from '@/test/skillPlansMocks';

vi.mock('@/sync', async () => (await import('@/test/skillPlansMocks')).syncMock());
vi.mock('@/app/syncStatus', async (importOriginal) =>
  (await import('@/test/skillPlansMocks')).syncStatusMock(
    await importOriginal<typeof import('@/app/syncStatus')>()
  )
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/skillPlansMocks')).loadSdeMock());

installSkillPlansHarness();

describe('SkillPlans Optimize queue', () => {
  const longQueue = [
    { skill_id: 1, queue_position: 0, finished_level: 5 },
    { skill_id: 3, queue_position: 1, finished_level: 5 },
  ];

  it('makes a remapped plan from the queue, opens it, and Undo takes it back', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({ ...attributesPayload, bonus_remaps: 2 })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json(longQueue)
      )
    );
    const user = userEvent.setup({ delay: null });
    renderSkillsRoutes();

    const optimizeItem = () =>
      screen.getByRole('menuitem', { name: 'From your skill queue, optimized' });
    await waitFor(async () => {
      if (!screen.queryByRole('menu')) {
        await user.click(screen.getByRole('button', { name: 'More ways to start a plan' }));
      }
      expect(optimizeItem()).not.toHaveAttribute('aria-disabled', 'true');
    });
    await user.click(optimizeItem());

    const stored = await waitFor(async () => {
      const all = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(all).toHaveLength(1);
      return all;
    });
    expect(stored[0]!.name).toMatch(/^Skill queue · \d{4}-\d{2}-\d{2}$/);
    expect(stored[0]!.entries).toHaveLength(2);
    expect(stored[0]!.markers?.length).toBeGreaterThan(0);
    await waitFor(() => expect(window.location.pathname).toBe(`/skills/plans/${stored[0]!.id}`));
    expect(await screen.findByText(/^Made "Skill queue · /)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(window.location.pathname).toBe('/skills/plans'));
    expect(await db.skillPlans.where('characterId').equals(CHAR_ID).count()).toBe(0);
  });

  it('is inert with an empty queue', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([])
      )
    );
    const user = userEvent.setup({ delay: null });
    renderSkillsRoutes();

    const optimizeItem = () =>
      screen.getByRole('menuitem', { name: 'From your skill queue, optimized' });
    await user.click(await screen.findByRole('button', { name: 'More ways to start a plan' }));
    await waitFor(() => expect(optimizeItem()).toHaveAttribute('aria-disabled', 'true'));
    await user.click(optimizeItem());
    expect(await db.skillPlans.where('characterId').equals(CHAR_ID).count()).toBe(0);
  });
});

describe('SkillPlans CRUD', () => {
  it('creates a plan and navigates straight to its editor, scheduling a sync', async () => {
    const user = userEvent.setup({ delay: null });
    renderSkillsRoutes();

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

  it('offers New plan and its other starts before any plan exists, and no All plans to open', async () => {
    renderSkillsRoutes();
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More ways to start a plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All plans' })).not.toBeInTheDocument();
  });

  it('shows the plan edited last on the page, not the oldest', async () => {
    await db.skillPlans.add(seedPlan({ id: 'old', name: 'Old plan', updatedAt: 1 }));
    await db.skillPlans.add(seedPlan({ id: 'new', name: 'Newest plan', updatedAt: 2 }));
    renderSkillsRoutes();
    const link = await screen.findByRole('link', { name: /Newest plan/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/skills/plans/new'));
    expect(screen.queryByRole('link', { name: /Old plan/ })).not.toBeInTheDocument();
  });

  it('imports a cleanly pasted skill plan into a new plan with no dialog, and offers Undo', async () => {
    window.history.replaceState(
      { usr: { skillPlanImportText: 'Gunnery V' }, key: 'paste', idx: 0 },
      '',
      '/skills/plans'
    );
    const user = userEvent.setup({ delay: null });
    renderSkillsRoutes();

    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Import plan' })).not.toBeInTheDocument();

    const stored = await waitFor(async () => {
      const all = await db.skillPlans.where('characterId').equals(CHAR_ID).toArray();
      expect(all).toHaveLength(1);
      return all;
    });
    await waitFor(() => expect(window.location.pathname).toBe(`/skills/plans/${stored[0].id}`));
    await waitFor(async () => {
      expect((await db.skillPlans.get(stored[0].id))?.entries).toHaveLength(5);
    });
    await waitFor(() => expect((window.history.state as { usr: unknown }).usr).toBeNull());

    await user.click(await screen.findByRole('button', { name: /undo/i }));
    await waitFor(async () => {
      expect((await db.skillPlans.get(stored[0].id))?.entries).toHaveLength(0);
    });
  });

  it('opens the Import dialog on the preview when a pasted skill plan has a line that fails', async () => {
    window.history.replaceState(
      { usr: { skillPlanImportText: 'Gunnery V\nNot A Skill 4' }, key: 'paste', idx: 0 },
      '',
      '/skills/plans'
    );
    renderSkillsRoutes();

    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    expect(await within(dialog).findByText(/^Line 2:/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(within(dialog).getByRole('textbox', { name: /paste/i })).toHaveValue(
      'Gunnery V\nNot A Skill 4'
    );
  });

  it('keeps a plan open when it belongs to another Character, as after a Character switch', async () => {
    await db.skillPlans.add(seedPlan({ characterId: CHAR_ID + 1, name: 'Alt plan' }));
    goToPlanEditor();
    renderSkillsRoutes();

    expect(await screen.findByDisplayValue('Alt plan')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/plans/plan-1');
  });

  it('renames a plan from the list, scheduling a sync', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    const plans = await openAllPlans(user);
    await user.click(
      await within(plans).findByRole('button', { name: 'More actions for Test plan' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByRole('textbox', { name: 'Rename' });
    await user.clear(input);
    await user.type(input, 'PvP Fit{Enter}');

    expect(await within(plans).findByText('PvP Fit')).toBeInTheDocument();
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.name).toBe('PvP Fit'));
    await waitFor(() => expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID));
  });

  it('duplicates a plan from the list and navigates to the copy’s editor, scheduling a sync', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    const plans = await openAllPlans(user);
    await user.click(
      await within(plans).findByRole('button', { name: 'More actions for Test plan' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));

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

  it('hides a deleted plan behind an Undo toast and deletes it once the toast ends', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    const plans = await openAllPlans(user);
    await user.click(
      await within(plans).findByRole('button', { name: 'More actions for Test plan' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(screen.queryByRole('dialog', { name: 'Delete' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(markPlanDeletedMock).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(markPlanDeletedMock).toHaveBeenCalledWith(CHAR_ID, 'plan-1'));
  });

  it('Undo cancels the delete', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    const plans = await openAllPlans(user);
    await user.click(
      await within(plans).findByRole('button', { name: 'More actions for Test plan' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(markPlanDeletedMock).not.toHaveBeenCalled();
    expect(await db.skillPlans.where('characterId').equals(CHAR_ID).count()).toBe(1);
  });

  it('returns to the list via the back link, and via the browser’s own Back after opening a plan', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    await user.click(await screen.findByText('Test plan'));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/plans/plan-1');

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/skills/plans');

    await user.click(await screen.findByText('Test plan'));
    expect(await screen.findByText('Your entries')).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/skills/plans'));
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
  });
});

describe('SkillPlans: the section title survives opening a plan', () => {
  it('keeps the Skills page title above the sub-nav in the editor, as on the list', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    expect(await screen.findByRole('heading', { level: 1, name: 'Skills' })).toBeInTheDocument();

    await user.click(await screen.findByText('Test plan'));
    await screen.findByText('Your entries');

    expect(screen.getByRole('heading', { level: 1, name: 'Skills' })).toBeInTheDocument();
  });
});

describe('SkillPlans layout: side by side list + editor (#158)', () => {
  it('shows one column at a time on narrow screens, with a back control that returns to the list', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^Attributes\s*Accelerator/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Attributes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to plans' })).not.toBeInTheDocument();

    await user.click(await screen.findByText('Test plan'));
    await screen.findByText('Your entries');

    expect(screen.queryByRole('link', { name: 'Test plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plan tools/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Back to plans' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));

    expect(
      await screen.findByRole('button', { name: /^Attributes\s*Accelerator/ })
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
  });

  it('keeps both panes visible on desktop, with no back control', async () => {
    stubViewport(() => true);

    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    renderSkillsRoutes();

    expect(await screen.findByRole('heading', { name: 'Attributes' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Optimize queue' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Attributes\s*Accelerator/ })
    ).not.toBeInTheDocument();

    await user.click(await screen.findByRole('link', { name: /^Test plan/ }));
    await screen.findByText('Your entries');

    const listPanel = (await screen.findByRole('link', { name: /^Test plan/ })).closest('section');
    expect(listPanel).not.toHaveClass('hidden');
    expect(screen.queryByRole('link', { name: 'Back to plans' })).not.toBeInTheDocument();
  });
});

describe('SkillPlans: current attributes beside the plan list', () => {
  beforeEach(() => {
    stubViewport(() => true);
  });
  const attributesPanel = async () =>
    (await screen.findByRole('heading', { name: 'Attributes' })).closest('section')!;

  it("shows the character's attributes from ESI, not the planner's placeholder defaults", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 21,
          intelligence: 24,
          memory: 23,
          perception: 22,
          willpower: 25,
        })
      )
    );
    renderSkillsRoutes();

    const panel = await attributesPanel();
    expect(await within(panel).findByText('24')).toBeInTheDocument();
    expect(within(panel).getByText('INT')).toBeInTheDocument();
    expect(within(panel).getByText('25')).toBeInTheDocument();
    expect(within(panel).getByText('21')).toBeInTheDocument();
  });

  it('adds the implant bonus on top of the base attribute, as the trained view does', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/implants`, () =>
        HttpResponse.json([9899])
      ),
      http.get('https://esi.evetech.net/universe/types/9899', () =>
        HttpResponse.json({
          type_id: 9899,
          name: 'Ocular Filter - Basic',
          description: '',
          group_id: 300,
          published: true,
          dogma_attributes: [{ attribute_id: 178, value: 3 }],
        })
      ),
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({ ...attributesPayload, perception: 23 })
      )
    );
    renderSkillsRoutes();

    const panel = await attributesPanel();
    expect(await within(panel).findByText('23')).toBeInTheDocument();
    expect(
      within(panel).getByText('20 base + 3 implant = 23', { selector: '.sr-only' })
    ).toBeInTheDocument();
  });

  it('says the attributes are unknown when ESI fails, rather than inventing a sheet', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.error()
      )
    );
    renderSkillsRoutes();

    const panel = await attributesPanel();
    expect(await within(panel).findByText('—')).toBeInTheDocument();
    expect(within(panel).queryByText('INT')).not.toBeInTheDocument();
  });
});

describe('SkillPlans: an injected accelerator under Attributes', () => {
  beforeEach(() => {
    stubViewport(() => true);
  });
  const attributesPanel = async () =>
    (await screen.findByRole('heading', { name: 'Attributes' })).closest('section')!;

  it('lets the pilot set the time left on a detected accelerator without opening a plan', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 22,
          intelligence: 23,
          memory: 23,
          perception: 23,
          willpower: 23,
        })
      )
    );
    renderSkillsRoutes();

    const panel = await attributesPanel();
    expect(await within(panel).findByText('+3 detected')).toBeInTheDocument();
    expect(within(panel).getByRole('group', { name: 'Time left' })).toBeInTheDocument();
  });

  it('shows no accelerator controls when nothing is injected', async () => {
    renderSkillsRoutes();

    const panel = await attributesPanel();
    expect(await within(panel).findByText('INT')).toBeInTheDocument();
    expect(within(panel).queryByText('Accelerator')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Add accelerator' })).toBeNull();
  });
});

describe('SkillPlans editor: the same attributes, on the route they are costed on', () => {
  it("shows the character's current attributes in the editor's tools pane, dated", async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 21,
          intelligence: 24,
          memory: 23,
          perception: 22,
          willpower: 25,
        })
      )
    );
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    const section = toolsSection('Attributes');
    expect(await within(section).findByText('24')).toBeInTheDocument();
    expect(within(section).getByText('INT')).toBeInTheDocument();
    expect(within(section).getByText('25')).toBeInTheDocument();
    expect(section.querySelector('time')).not.toBeNull();
    expect(within(section).queryByLabelText('What-if implants')).toBeNull();
    await openAssumptions();
    expect(screen.getByLabelText('What-if implants')).toBeInTheDocument();
  });
});

describe('SkillPlans: cached data notice', () => {
  it('says nothing while every read is live', async () => {
    renderSkillsRoutes();
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
    await waitFor(async () => {
      expect(await db.esiCache.get([CHAR_ID, 'skills'])).toBeDefined();
      expect(await db.esiCache.get([CHAR_ID, 'skillqueue'])).toBeDefined();
    });
    expect(screen.queryByText('Showing cached data')).not.toBeInTheDocument();
  });

  it('dates the notice by the cached skills, not by the fresh queue read next to them', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'skills',
      value: emptySkillsPayload,
      fetchedAt: Date.now() - 5 * HOUR_MS - 60_000,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );
    renderSkillsRoutes();
    expect(await screen.findByText('Showing cached data')).toBeInTheDocument();
    expect(screen.getByText('Showing cached data').closest('p')).toHaveTextContent(
      'Showing cached data · 5h ago'
    );
  });
});
