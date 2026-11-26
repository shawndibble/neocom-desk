import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { renderSkillsRoutes } from '@/test/skillsRoutes';
import { stubViewport } from '@/test/viewport';
import {
  CHAR_ID,
  server,
  seedPlan,
  goToPlanEditor,
  openPlanTools,
  clipboard,
  installSkillPlansHarness,
} from '@/test/skillPlansPage';
import { scheduleSyncMock } from '@/test/skillPlansMocks';

vi.mock('@/sync', async () => (await import('@/test/skillPlansMocks')).syncMock());
vi.mock('@/app/syncStatus', async (importOriginal) =>
  (await import('@/test/skillPlansMocks')).syncStatusMock(
    await importOriginal<typeof import('@/app/syncStatus')>()
  )
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/skillPlansMocks')).loadSdeMock());

installSkillPlansHarness();

describe('SkillPlans editor: add-skill picker', () => {
  it('inserts prerequisites into the computed queue, dimmed, ahead of the user entry', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    stubViewport(() => true);
    renderSkillsRoutes();

    const search = await screen.findByRole('searchbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));
    await user.click(await screen.findByRole('button', { name: 'Level I' }));

    const panel = screen.getByText('Your entries').closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery I'),
      expect.stringContaining('Gunnery II'),
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Small Hybrid Turret I'),
    ]);
    expect(items[0].textContent).toMatch(/prereq/i);
    expect(items[1].textContent).toMatch(/prereq/i);
    expect(items[2].textContent).toMatch(/prereq/i);
    expect(items[3].textContent).not.toMatch(/prereq/i);

    expect(within(panel).getByText('Takes')).toBeInTheDocument();
    expect(within(panel).getByText('Done by')).toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it("shows the expanded skill's prerequisites (untrained) and unlocks inline (#18)", async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();

    const search = await screen.findByRole('searchbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));

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
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(
      within(panel).getByText('No entries yet. Add a skill to get started.')
    ).toBeInTheDocument();
  });

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
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(
      within(panel).queryByText('No entries yet. Add a skill to get started.')
    ).not.toBeInTheDocument();
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Gunnery III');
      expect(within(items[0]).getAllByText('0m')).toHaveLength(1);
    });
  });
});

describe('SkillPlans: /skills is stale until the character logs in', () => {
  it('counts a level the queue finished in the past as trained, though /skills omits it', async () => {
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
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(within(items[0]).getAllByText('0m')).toHaveLength(1);
    });
  });

  it('does not credit a paused queue entry, which has no finish date at all', async () => {
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    await waitFor(async () =>
      expect(await within(panel).findAllByRole('listitem')).toHaveLength(3)
    );
    const items = await within(panel).findAllByRole('listitem');
    expect(within(items[0]).queryByText('0m')).not.toBeInTheDocument();
  });
});

describe('CurrentQueuePanel: what ESI knows that /skills does not', () => {
  const queuePanel = async () =>
    (await screen.findByText('Current skill queue')).closest('section')!;

  it('keeps a finished entry visible as a compact Done row', async () => {
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
    renderSkillsRoutes();

    const panel = await queuePanel();
    expect(await within(panel).findByText('Done')).toBeInTheDocument();
    expect(within(panel).queryByText(/Log in to EVE/i)).not.toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { name: 'Finished' })).not.toBeInTheDocument();
  });

  it("shows the training skill's remaining time from ESI's finish_date", async () => {
    const finish = new Date(Date.now() + 2 * 3600_000 + 30 * 60_000).toISOString();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          { skill_id: 1, queue_position: 0, finished_level: 3, finish_date: finish },
        ])
      )
    );
    renderSkillsRoutes();

    const panel = await queuePanel();
    expect(await screen.findByRole('region', { name: 'Training now' })).toBeInTheDocument();
    expect(within(panel).getByText(/^2h/)).toBeInTheDocument();
    expect(within(panel).getByText(/^done /)).toBeInTheDocument();
  });

  it('calls a queue with no dates paused, rather than pretending it starts now', async () => {
    renderSkillsRoutes();

    const panel = await queuePanel();
    expect(await within(panel).findByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(within(panel).getAllByText('Paused')).toHaveLength(3);
    expect(
      within(panel).getByText(/Training is paused, so EVE shows no finish times\./i)
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/left/i)).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: import / export', () => {
  it('imports the in-game skill queue (deduped) and exports the computed queue to the clipboard', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From skill queue' }));
    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    expect(await within(entriesPanel).findByText(/^Gunnery\b/)).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.skillPlans.get('plan-1');
      expect(stored?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 3, targetLevel: 1 },
      ]);
    });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    expect(clipboard.writeText).toHaveBeenCalledWith(
      'Gunnery I\nGunnery II\nGunnery III\nSpaceship Command I'
    );
  });

  it('shows an inline error (no unhandled rejection) when the in-game queue import fails to parse (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([{ skill_id: 1, queue_position: 0 }])
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From skill queue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid finished_level/);
  });
});

describe('SkillPlans editor: import from clipboard', () => {
  it('previews and applies a pasted skill plan, and reports unresolvable lines', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III\nNot A Real Skill II');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText(/unknown skill: Not A Real Skill/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
      ])
    );
  });

  it('previews and applies a pasted EFT fit, resolving required skills from ESI dogma_attributes', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.click(textarea);
    await user.paste('[Rifter, Test Fit]\n[Empty High slot]');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
      ])
    );
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
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III\nSpaceship Command I\nNot A Real Skill II');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText('Already trained')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
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
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('0 added — all trained')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: schedule timeline (#20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("projects a plan finish date that matches the entry row's own finish (#20)", async () => {
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items).toHaveLength(1);

    const summary = screen.getAllByText('Projected finish')[0].closest('section')!;
    const planFinishDate = within(summary)
      .getByText('Projected finish')
      .parentElement!.textContent!.replace('Projected finish', '')
      .trim();
    expect(planFinishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(items[0].textContent).toContain(planFinishDate);
  });

  it('shows no projected finish date, and no invented start time, for an empty plan (#20)', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    await within(panel).findByText('No entries yet. Add a skill to get started.');
    expect(within(panel).queryByText(/Finishes/)).not.toBeInTheDocument();
  });
});

describe('SkillPlans: current skill queue panel', () => {
  it('shows the in-game skill queue with training times, separate from any plan', async () => {
    renderSkillsRoutes();

    const panel = (await screen.findByText('Current skill queue')).closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Spaceship Command I'),
    ]);
  });

  it('renders after the plan row and attributes on a phone, not before them', async () => {
    renderSkillsRoutes();

    const plan = await screen.findByRole('button', { name: 'New plan' });
    const queuePanel = (await screen.findByText('Current skill queue')).closest('section')!;

    expect(
      plan.compareDocumentPosition(queuePanel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
